import fs from 'node:fs';
import path from 'node:path';
const env = fs.readFileSync(path.join(import.meta.dirname, '..', '.env'), 'utf8');
const key = env.match(/BHARATCODE_API_KEY=(\S+)/)[1];
const model = (env.match(/BHARATCODE_MODEL=(\S+)/) || [])[1] || 'qwen3.8-27b';
const base = (env.match(/BHARATCODE_BASE_URL=(\S+)/) || [])[1] || 'https://api.prod.adaptionlabs.ai/api/v1';

const sys = 'Emit ONLY a JSON object with keys entryName (string), bruteForceCode (string), generatorCode (string). bruteForceCode is a correct O(N^2) JS function bruteForce(nums,target) returning [i,j] or []. generatorCode is function makeInput(rng,size) returning [nums,target]. entryName is "twoSum".';

async function go(label, extra) {
  const body = {
    model,
    max_tokens: 3000,
    temperature: 0.1,
    response_format: { type: 'json_schema', json_schema: { name: 'r', schema: { type: 'object', additionalProperties: false, required: ['entryName', 'bruteForceCode', 'generatorCode'], properties: { entryName: { type: 'string' }, bruteForceCode: { type: 'string' }, generatorCode: { type: 'string' } } }, strict: true } },
    messages: [{ role: 'system', content: sys }, { role: 'user', content: 'Produce the JSON for the two-sum problem.' }],
    ...extra,
  };
  const res = await fetch(base + '/chat/completions', { method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let fr = '?', has = false, len = 0;
  try { const d = JSON.parse(text); fr = d.choices[0].finish_reason; has = !!(d.choices[0].message.content); len = (d.choices[0].message.content || '').length; } catch (e) {}
  console.log(label, '→ HTTP', res.status, '| finish:', fr, '| hasContent:', has, '| contentLen:', len, res.ok ? '' : '| ' + text.slice(0, 160));
}

await go('A: reasoning_effort=low    ', { reasoning_effort: 'low' });
await go('B: reasoning_effort=none   ', { reasoning_effort: 'none' });
await go('C: reasoning={effort:none} ', { reasoning: { effort: 'none' } });
await go('D: default (no reasoning)  ', {});

