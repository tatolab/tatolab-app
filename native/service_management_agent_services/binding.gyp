{
  "targets": [
    {
      "target_name": "service_management_agent_services",
      "conditions": [
        [
          "OS=='mac'",
          {
            "sources": ["service_management_agent_services.mm"],
            "link_settings": { "libraries": ["-framework Foundation", "-framework ServiceManagement"] },
            "xcode_settings": {
              "CLANG_ENABLE_OBJC_ARC": "YES",
              "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
              "MACOSX_DEPLOYMENT_TARGET": "15.0"
            }
          }
        ]
      ]
    }
  ]
}
