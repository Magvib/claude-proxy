console.log("\x1b[1;36mStarting claude-proxy...\x1b[0m");

const ollamaKey = process.env.OLLAMA_KEY || "";
const port = process.env.PORT || 1810;
const opusAlternative = process.env.OPUS_ALTERNATIVE || "glm-5.1";
const sonnetAlternative = process.env.SONNET_ALTERNATIVE || "kimi-k2.6";
const haikuAlternative = process.env.HEIKU_ALTERNATIVE || "deepseek-v4-flash";
const log = process.env.LOGGING || false;
const logPrefix = log ? "\x1b[1;36m" : "";

if (log) {
    console.log(`${logPrefix}Starting server on port ${port}...`);
}

const server = Bun.serve({
    idleTimeout: 255,
    port: port,
    routes: {
        "/v1/models": async req => {
            const ollamaModels = await fetch("https://ollama.com/v1/models").then(res => res.json()) as { object: string; data: Array<{ id: string; object: string; owned_by: string; created: number }> };

            const claudeModels = {
                data: ollamaModels.data.map((model) => ({
                    created_at: new Date(model.created * 1000).toISOString(),
                    display_name: model.id.replace(/[:-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                    id: 'opus-' + model.id,
                    type: "model"
                })).sort((a, b) => a.display_name.localeCompare(b.display_name))
            };

            return new Response(JSON.stringify(claudeModels), {
                headers: { "Content-Type": "application/json" }
            });
        },
        "/v1/web_search": async req => {
            const searchUrl = "https://ollama.com/api/web_search";
            const query = new URL(req.url).searchParams.get("query") || "";

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

            // replace claude-opus-4-7 with kimi-k2.6
            body = body.replace(/"model":"claude-opus-4-7"/g, `"model":"${opusAlternative}"`);
            body = body.replace(/"model":"claude-sonnet-4-6"/g, `"model":"${sonnetAlternative}"`);
            body = body.replace(/"model":"claude-haiku-4-5-20251001"/g, `"model":"${haikuAlternative}"`);

            // remove 'opus-' && 'claude-'
            body = body.replace(/"model":"opus-/g, '"model":"');
            body = body.replace(/"model":"claude-/g, '"model":"');

            const response = await fetch(`https://ollama.com/${path}`, {
                method,
                body,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ollamaKey}`
                }
            });

            if (log) {
                console.log(logPrefix, method, path, response.status, 'model', model);
            }

            return response;
        }
    }
});