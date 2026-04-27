import { consola } from "consola";

const snippet = (text: string) => {
  const indented = text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `\x1b[3;36m${indented}\x1b[0m`;
};

export const showWranglerConfigMessage = (wranglerPath: string, token: string) => {
  const type = wranglerPath.endsWith("wrangler.toml") ? "toml" : "json";

  if (type === "toml") {
    consola.warn("Found an existing wrangler.toml file.");
    consola.info("Please add the following EdgePod bindings to your wrangler.toml:");
    console.log(
      snippet(`
[vars]
EDGEPOD_PUBLIC_TOKEN = "${token}"

[[durable_objects.bindings]]
name = "EDGEPOD_DO"
class_name = "EdgePodEngine"

[[migrations]]
tag = "v1"
new_classes = ["EdgePodEngine"]

[[rules]]
type = "Text"
globs = ["edgepod/.generated/migrations/**/*.sql"]
fallthrough = true`)
    );
  } else {
    consola.warn("Found an existing wrangler.json file.");
    consola.info("Please merge the following EdgePod bindings into your wrangler.json:");
    console.log(
      snippet(`
"vars": {
  "EDGEPOD_PUBLIC_TOKEN": "${token}"
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
    "new_classes": ["EdgePodEngine"]
  }
],
"rules": [
  {
    "type": "Text",
    "globs": ["edgepod/.generated/migrations/**/*.sql"],
    "fallthrough": true
  }
]`)
    );
  }
  consola.info(
    "For production, replace the vars entry with a Wrangler secret — run: ep deploy (it handles this automatically)."
  );
};
