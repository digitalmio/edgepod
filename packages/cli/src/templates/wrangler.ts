export const wranglerJsonTemplate = () => {
  const date = new Date().toISOString().split("T")[0];

  return `{
  "name": "edgepod-server",
  "main": "./edgepod/.internal/server.ts",
  "compatibility_date": "${date}",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "EDGEPOD_DO",
        "class_name": "EdgePodEngine"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": [
        "EdgePodEngine"
      ]
    }
  ],
  "rules": [
    {
      "type": "Text",
      "globs": ["edgepod/.generated/migrations/**/*.sql"],
      "fallthrough": true
    }
  ]
}
`;
};
