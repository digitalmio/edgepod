export const wranglerJsonTemplate = (apiKey: string) => {
  const date = new Date().toISOString().split("T")[0];

  return `{
  "name": "edgepod-server",
  "main": "./.generated/server.ts",
  "compatibility_date": "${date}",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "vars": {
    "EDGEPOD_API_KEY": "${apiKey}"
  },
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
      "new_sqlite_classes": [
        "EdgePodEngine"
      ]
    }
  ]
}
`;
};
