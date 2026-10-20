// Copyright (c) 2025 Jonathan Fontanez
// SPDX-License-Identifier: LicenseRef-Tatolab-Proprietary

// Service Management's agent services for the Electron app's main process, as a Node-API addon:
// the status, registration and unregistration of an `SMAppService` launch agent, answering
// Service Management's own `NSError` text, which Electron's login item API keeps to its log.
// Those three go over XPC to smd and can block, so they run on libuv's pool, never on the main
// thread, which on macOS is the window's and the tray's.
//
// Exports, each taking the agent plist's file name where it names one:
//   agentServiceStatus(name)       -> Promise<"enabled" | "requires-approval" | "not-registered" | "not-found">
//   registerAgentService(name)     -> Promise<null | the NSError's localizedDescription>
//   unregisterAgentService(name)   -> Promise<null | the NSError's localizedDescription>
//   openSystemSettingsLoginItems() -> undefined

#import <Foundation/Foundation.h>
#import <ServiceManagement/ServiceManagement.h>
#include <node_api.h>

#include <string>

namespace {

enum class AgentServiceRequest { status, register_service, unregister_service };

// One request on the pool: its input, its answer, and the promise it settles.
struct AgentServiceRequestWork {
  AgentServiceRequest request;
  std::string agent_plist_name;
  std::string answer_text;
  bool answer_is_null = false;
  napi_deferred deferred = nullptr;
  napi_async_work async_work = nullptr;
};

napi_value undefined_value(napi_env env) {
  napi_value undefined = nullptr;
  napi_get_undefined(env, &undefined);
  return undefined;
}

std::string utf8_of(NSString *text) {
  const char *utf8 = text.UTF8String;
  return utf8 == nullptr ? std::string() : std::string(utf8);
}

std::string refusal_text_of(NSError *error) {
  std::string refusal_text = error == nil ? std::string() : utf8_of(error.localizedDescription);
  return refusal_text.empty() ? std::string("Service Management refused without saying why") : refusal_text;
}

const char *status_spelling(SMAppServiceStatus status) {
  switch (status) {
    case SMAppServiceStatusEnabled:
      return "enabled";
    case SMAppServiceStatusRequiresApproval:
      return "requires-approval";
    case SMAppServiceStatusNotRegistered:
      return "not-registered";
    default:
      return "not-found";
  }
}

// Runs on libuv's pool: no napi call is allowed here.
void execute_agent_service_request(napi_env, void *data) {
  auto *work = static_cast<AgentServiceRequestWork *>(data);
  @autoreleasepool {
    NSString *agent_plist_name = [NSString stringWithUTF8String:work->agent_plist_name.c_str()];
    SMAppService *agent_service = [SMAppService agentServiceWithPlistName:agent_plist_name];
    NSError *error = nil;
    switch (work->request) {
      case AgentServiceRequest::status:
        work->answer_text = status_spelling(agent_service.status);
        return;
      case AgentServiceRequest::register_service:
        work->answer_is_null = [agent_service registerAndReturnError:&error];
        break;
      case AgentServiceRequest::unregister_service:
        work->answer_is_null = [agent_service unregisterAndReturnError:&error];
        break;
    }
    if (!work->answer_is_null) work->answer_text = refusal_text_of(error);
  }
}

// Runs on the main thread once the request is done: settles its promise and frees it.
void complete_agent_service_request(napi_env env, napi_status, void *data) {
  auto *work = static_cast<AgentServiceRequestWork *>(data);
  napi_value answer = nullptr;
  if (work->answer_is_null) {
    napi_get_null(env, &answer);
  } else {
    napi_create_string_utf8(env, work->answer_text.c_str(), work->answer_text.size(), &answer);
  }
  napi_resolve_deferred(env, work->deferred, answer);
  napi_delete_async_work(env, work->async_work);
  delete work;
}

// The promise of `request` for the agent plist named by the call's first argument; throws a
// TypeError when there is none.
napi_value queue_agent_service_request(napi_env env, napi_callback_info info, AgentServiceRequest request) {
  size_t argument_count = 1;
  napi_value argument = nullptr;
  size_t name_length = 0;
  if (napi_get_cb_info(env, info, &argument_count, &argument, nullptr, nullptr) != napi_ok || argument_count < 1 ||
      napi_get_value_string_utf8(env, argument, nullptr, 0, &name_length) != napi_ok) {
    napi_throw_type_error(env, nullptr, "the agent plist name is not a string");
    return undefined_value(env);
  }
  auto *work = new AgentServiceRequestWork{};
  work->request = request;
  work->agent_plist_name.resize(name_length + 1);
  napi_get_value_string_utf8(env, argument, work->agent_plist_name.data(), name_length + 1, &name_length);
  work->agent_plist_name.resize(name_length);

  napi_value promise = nullptr;
  napi_value resource_name = nullptr;
  if (napi_create_promise(env, &work->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "ServiceManagementAgentServiceRequest", NAPI_AUTO_LENGTH, &resource_name) != napi_ok ||
      napi_create_async_work(env, nullptr, resource_name, execute_agent_service_request, complete_agent_service_request, work,
                             &work->async_work) != napi_ok ||
      napi_queue_async_work(env, work->async_work) != napi_ok) {
    if (work->async_work != nullptr) napi_delete_async_work(env, work->async_work);
    delete work;
    napi_throw_error(env, nullptr, "the Service Management request could not be queued");
    return undefined_value(env);
  }
  return promise;
}

napi_value agent_service_status(napi_env env, napi_callback_info info) {
  return queue_agent_service_request(env, info, AgentServiceRequest::status);
}

napi_value register_agent_service(napi_env env, napi_callback_info info) {
  return queue_agent_service_request(env, info, AgentServiceRequest::register_service);
}

napi_value unregister_agent_service(napi_env env, napi_callback_info info) {
  return queue_agent_service_request(env, info, AgentServiceRequest::unregister_service);
}

// Opens a window, so it stays on the main thread.
napi_value open_system_settings_login_items(napi_env env, napi_callback_info) {
  @autoreleasepool {
    [SMAppService openSystemSettingsLoginItems];
  }
  return undefined_value(env);
}

napi_value initialize_service_management_agent_services(napi_env env, napi_value exports) {
  napi_property_descriptor exported_functions[] = {
      {"agentServiceStatus", nullptr, agent_service_status, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"registerAgentService", nullptr, register_agent_service, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"unregisterAgentService", nullptr, unregister_agent_service, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
      {"openSystemSettingsLoginItems", nullptr, open_system_settings_login_items, nullptr, nullptr, nullptr, napi_enumerable, nullptr},
  };
  if (napi_define_properties(env, exports, sizeof(exported_functions) / sizeof(exported_functions[0]), exported_functions) != napi_ok) {
    return nullptr;
  }
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize_service_management_agent_services)
