console.log("\x1b[1;36mStarting claude-proxy...\x1b[0m");

const ollamaKey = process.env.OLLAMA_KEY || "";
const openrouterKey = process.env.OPENROUTER_KEY || "";

const port = process.env.PORT || 1810;
const log = process.env.LOGGING ? process.env.LOGGING == "true" : false;
const logPrefix = log ? "\x1b[1;36m" : "";

const opusAlternative = process.env.OPUS_ALTERNATIVE || "glm-5.2";
const sonnetAlternative = process.env.SONNET_ALTERNATIVE || "deepseek-v4-flash";
const haikuAlternative = process.env.HAIKU_ALTERNATIVE || "gemma4:31b";

const openRouterModels = [
    'openai/gpt-5.6-luna',
    'anthropic/claude-fable-5',
    'anthropic/claude-opus-4.8',
    'anthropic/claude-sonnet-5',
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'minimax/minimax-m3',
    'x-ai/grok-4.5',
];

if (log) {
    console.log(`${logPrefix}Starting server on port ${port}...`);
}

const server = Bun.serve({
    idleTimeout: 255,
    port: port,
    tls: {
        cert: Bun.file(process.env.CERT || ""),
        key: Bun.file(process.env.KEY || "")
    },
    routes: {
        "/v1/models": async req => {
            const ollamaModels = await fetch("https://ollama.com/v1/models").then(res => res.json()) as { object: string; data: Array<{ id: string; object: string; owned_by: string; created: number }> };

            const claudeModels = {
                data: ollamaModels.data.map((model) => ({
                    created_at: new Date(model.created * 1000).toISOString(),
                    display_name: model.id.replace(/[:-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                    id: 'claude-opus-:' + btoa(model.id),
                    type: "model"
                })).sort((a, b) => a.display_name.localeCompare(b.display_name))
            };

            openRouterModels.forEach((model) => {
                claudeModels.data.push({
                    created_at: new Date().toISOString(),
                    display_name: (model.split("/")[1] ?? '').replace(/[:-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()) + " (OpenRouter)",
                    id: 'claude-opus-:' + btoa('openrouter-' + model),
                    type: "model"
                });
            });

            return new Response(JSON.stringify(claudeModels), {
                headers: { "Content-Type": "application/json" }
            });
        },
        "/api/web_search": async req => {
            const searchUrl = "https://ollama.com/api/web_search";
            const body = await req.json() as { q?: string };
            const query = body.q || "";

            if (!query) {
                return new Response(JSON.stringify({
                    "results": []
                }));
            }

            const response = await fetch(searchUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ollamaKey}`
                },
                body: JSON.stringify({ query })
            });

            const data = await response.json();
            return new Response(JSON.stringify(data), {
                headers: { "Content-Type": "application/json" }
            });
        },
        "/*" : async req => {
            const url = new URL(req.url);
            const path = url.pathname;
            const method = req.method;
            var body = await req.text();
            const model = body.match(/"model":"([^"]+)"/)?.[1] || "";
            var provider = "ollama";

            // replace claude-opus-4-7 with kimi-k2.6
            body = body.replace(/"model":"claude-opus-4-7"/g, `"model":"${opusAlternative}"`);
            body = body.replace(/"model":"claude-opus-4-8"/g, `"model":"${opusAlternative}"`);
            body = body.replace(/"model":"claude-sonnet-4-6"/g, `"model":"${sonnetAlternative}"`);
            body = body.replace(/"model":"claude-haiku-4-5-20251001"/g, `"model":"${haikuAlternative}"`);

            // If model starts with claude-opus-: remove claude-opus-: and then base64 decode the rest
            if (model.startsWith("claude-opus-:")) {
                var modelDecoded = model.replace("claude-opus-:", "");
                modelDecoded = atob(modelDecoded);

                if (modelDecoded.startsWith("openrouter-")) {
                    provider = "openrouter";
                    modelDecoded = modelDecoded.replace("openrouter-", "");
                }
                
                body = body.replace(/"model":"claude-opus-:([^"]+)"/g, `"model":"${modelDecoded}"`);
            }

            // remove 'opus-' && 'claude-'
            body = body.replace(/"model":"opus-/g, '"model":"');
            body = body.replace(/"model":"claude-/g, '"model":"');

            // https://openrouter.ai/api/v1/messages
            var response = null;
            if (provider == "openrouter") {
                response = await fetch(`https://openrouter.ai/api${path}`, {
                    method,
                    body,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${openrouterKey}`
                    }
                });

                return response;
            } else if (provider == "ollama") {
                response = await fetch(`https://ollama.com/${path}`, {
                    method,
                    body,
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${ollamaKey}`
                    }
                });
            }

            if (log) {
                var modelForLog = model;
                if (model.startsWith("claude-opus-:")) {
                    try { modelForLog = atob(model.replace("claude-opus-:", "")); } catch {}
                }
                console.log(logPrefix, method, path, response?.status, 'model', modelForLog, 'provider', provider);
            }

            return response ?? new Response(JSON.stringify({
                error: "No response from provider"
            }), {
                headers: { "Content-Type": "application/json" }
            });
        }
    }
});