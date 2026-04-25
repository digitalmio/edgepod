import pc from "picocolors";

export const showWranglerConfigMessage = (wranglerPath: string) => {
  const type = wranglerPath.endsWith("wrangler.toml") ? "toml" : "json";

  if (type === "toml") {
    console.log(`
${pc.yellow("⚠️  Found an existing wrangler.toml file.")}
${pc.white("Please add the following EdgePod bindings to your wrangler.toml to enable the database:")}

${pc.cyan(`[[durable_objects.bindings]]
name = "EDGEPOD_DO"
class_name = "EdgePodEngine"

[[migrations]]
tag = "v1"
new_classes = ["EdgePodEngine"]`)}
  `);
  } else {
    console.log(`
${pc.yellow("⚠️  Found an existing wrangler.json file.")}
${pc.white("Please merge the following EdgePod bindings into your wrangler.json:")}

${pc.cyan(`"durable_objects": {
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
    "new_classes": ["EdgePodEngine"]
  }
]`)}
  `);
  }
};
