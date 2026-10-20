// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Service Management's agent services for the Electron app's main process, as a Node-API addon:
// the status, registration and unregistration of an `SMAppService` launch agent, answering
// Service Management's own `NSError` text, which Electron's login item API keeps to its log.
//
// Exports, each taking the agent plist's file name where it names one:
//   agentServiceStatus(name)      -> "enabled" | "requires-approval" | "not-registered" | "not-found"
//   registerAgentService(name)    -> null, or the NSError's localizedDescription
//   unregisterAgentService(name)  -> null, or the NSError's localizedDescription
//   openSystemSettingsLoginItems() -> undefined

#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>
#include <node_api.h>

static napi_value undefined_value(napi_env env) {
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

static napi_value throw_type_error(napi_env env, const char *message) {
  napi_throw_type_error(env, nullptr, message);
  return undefined_value(env);
}

// The agent plist name passed as the call's first argument, or nil after throwing a TypeError.
static NSString *agent_plist_name_argument(napi_env env, napi_callback_info info) {
  size_t argument_count = 1;
  napi_value argument;
  if (napi_get_cb_info(env, info, &argument_count, &argument, nullptr, nullptr) != napi_ok || argument_count < 1) {
    throw_type_error(env, "the agent plist name is missing");
    return nil;
  }
  size_t name_length = 0;
  if (napi_get_value_string_utf8(env, argument, nullptr, 0, &name_length) != napi_ok) {
    throw_type_error(env, "the agent plist name is not a string");
    return nil;
  }
  NSMutableData *name_bytes = [NSMutableData dataWithLength:name_length + 1];
  napi_get_value_string_utf8(env, argument, static_cast<char *>(name_bytes.mutableBytes), name_length + 1, &name_length);
  return [[NSString alloc] initWithBytes:name_bytes.bytes length:name_length encoding:NSUTF8StringEncoding];
}

static napi_value string_value(napi_env env, NSString *text) {
  napi_value value;
  const char *utf8 = text.UTF8String;
  napi_create_string_utf8(env, utf8 == nullptr ? "" : utf8, NAPI_AUTO_LENGTH, &value);
  return value;
}

static napi_value null_or_error_description(napi_env env, BOOL succeeded, NSError *error) {
  if (succeeded) {
    napi_value null_value;
    napi_get_null(env, &null_value);
    return null_value;
  }
  return string_value(env, error == nil ? @"Service Management refused without saying why" : error.localizedDescription);
}

static napi_value agent_service_status(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *agent_plist_name = agent_plist_name_argument(env, info);
    if (agent_plist_name == nil) return undefined_value(env);
    switch ([SMAppService agentServiceWithPlistName:agent_plist_name].status) {
      case SMAppServiceStatusEnabled:
        return string_value(env, @"enabled");
      case SMAppServiceStatusRequiresApproval:
        return string_value(env, @"requires-approval");
      case SMAppServiceStatusNotRegistered:
        return string_value(env, @"not-registered");
      default:
        return string_value(env, @"not-found");
    }
  }
}

static napi_value register_agent_service(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *agent_plist_name = agent_plist_name_argument(env, info);
    if (agent_plist_name == nil) return undefined_value(env);
    NSError *error = nil;
    BOOL registered = [[SMAppService agentServiceWithPlistName:agent_plist_name] registerAndReturnError:&error];
    return null_or_error_description(env, registered, error);
  }
}

static napi_value unregister_agent_service(napi_env env, napi_callback_info info) {
  @autoreleasepool {
    NSString *agent_plist_name = agent_plist_name_argument(env, info);
    if (agent_plist_name == nil) return undefined_value(env);
    NSError *error = nil;
    BOOL unregistered = [[SMAppService agentServiceWithPlistName:agent_plist_name] unregisterAndReturnError:&error];
    return null_or_error_description(env, unregistered, error);
  }
}

static napi_value open_system_settings_login_items(napi_env env, napi_callback_info) {
  @autoreleasepool {
    [SMAppService openSystemSettingsLoginItems];
    return undefined_value(env);
  }
}

static napi_value initialize_service_management_agent_services(napi_env env, napi_value exports) {
  napi_property_descriptor exported_functions[] = {
      {"agentServiceStatus", nullptr, agent_service_status, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"registerAgentService", nullptr, register_agent_service, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"unregisterAgentService", nullptr, unregister_agent_service, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"openSystemSettingsLoginItems", nullptr, open_system_settings_login_items, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
  };
  napi_define_properties(env, exports, sizeof(exported_functions) / sizeof(exported_functions[0]), exported_functions);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize_service_management_agent_services)
