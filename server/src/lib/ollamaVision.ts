import sharp from 'sharp';

type Fetch = typeof fetch;

export type OllamaVisionConfig = {
    baseUrl: string;
    token: string | null;
    model: string;
    allowedImageHosts: string[];
};

export type VisionEvidence = {
    name: string;
    brand: string | null;
    model: string | null;
    category: string | null;
    condition: string | null;
    evidence: string[];
    uncertainties: string[];
    confidence: number;
};

export class VisionError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'VisionError';
    }
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function loadOllamaVisionConfig(env: NodeJS.ProcessEnv = process.env): OllamaVisionConfig | null {
    const rawUrl = env.OLLAMA_VISION_URL?.trim();
    if (!rawUrl) return null;
    let endpoint: URL;
    try { endpoint = new URL(rawUrl); }
    catch { throw new Error('OLLAMA_VISION_URL must be a valid URL'); }
    const local = endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname);
    if ((!local && endpoint.protocol !== 'https:') || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
        throw new Error('OLLAMA_VISION_URL must be a local HTTP or remote HTTPS origin');
    }
    const token = env.OLLAMA_VISION_TOKEN?.trim() || null;
    if (!local && !token) throw new Error('Remote OLLAMA_VISION_URL requires OLLAMA_VISION_TOKEN');
    const model = env.OLLAMA_VISION_MODEL?.trim() || 'qwen3-vl:2b-instruct';
    if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)) throw new Error('OLLAMA_VISION_MODEL is invalid');
    const hosts = [
        env.RAILWAY_PUBLIC_DOMAIN,
        env.RAILWAY_STATIC_URL,
        ...(env.OLLAMA_VISION_IMAGE_HOSTS || '').split(','),
    ].filter(Boolean).map(value => {
        try { return new URL(value!.startsWith('http') ? value! : `https://${value}`).hostname.toLowerCase(); }
        catch { throw new Error('OLLAMA_VISION_IMAGE_HOSTS contained an invalid host'); }
    });
    return { baseUrl: endpoint.origin, token, model, allowedImageHosts: [...new Set(hosts)] };
}

function cleanText(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const result = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return result ? result.slice(0, max) : null;
}

function strings(value: unknown, count: number, max: number): string[] {
    return Array.isArray(value) ? value.map(v => cleanText(v, max)).filter((v): v is string => !!v).slice(0, count) : [];
}

export function parseVisionEvidence(content: string): VisionEvidence {
    const plain = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const start = plain.indexOf('{'), end = plain.lastIndexOf('}');
    if (start < 0 || end <= start) throw new VisionError('Vision response had no JSON', 'VISION_BAD_RESPONSE');
    let raw: any;
    try { raw = JSON.parse(plain.slice(start, end + 1)); }
    catch { throw new VisionError('Vision JSON was invalid', 'VISION_BAD_RESPONSE'); }
    if (raw?.recognizable !== true) throw new VisionError('No identifiable subject in image', 'VISION_UNCERTAIN');
    const name = cleanText(raw.name, 160);
    const evidence = strings(raw.evidence, 6, 120);
    const confidence = Number(raw.confidence);
    if (!name || evidence.length === 0 || !Number.isFinite(confidence) || confidence < 0.65 || confidence > 1) {
        throw new VisionError('Vision evidence was insufficient', 'VISION_UNCERTAIN');
    }
    const brandCandidate = cleanText(raw.brand, 100);
    const supportedBrand = brandCandidate && evidence.some(line => line.includes(brandCandidate));
    const modelCandidate = cleanText(raw.model, 100);
    const supportedModel = modelCandidate && evidence.some(line => line.includes(modelCandidate) && /型號|編號|model|標示/i.test(line));
    return {
        name,
        brand: supportedBrand ? brandCandidate : null,
        model: supportedModel ? modelCandidate : null,
        category: cleanText(raw.category, 100),
        condition: cleanText(raw.condition, 120),
        evidence,
        uncertainties: [...strings(raw.uncertainties, 2, 120), ...(!supportedBrand && brandCandidate ? ['品牌缺少可見文字證據，需人工確認'] : []), ...(!supportedModel && modelCandidate ? ['型號缺少可見文字證據，需人工確認'] : [])],
        confidence,
    };
}

export function buildVisionPrompt() {
    return [
        '你是商品圖片的視覺鑑識員。只根據這張圖片實際可見的物品、標誌、字樣及包裝，以繁體中文回覆。不要根據網址、檔名或常見商品猜測。',
        '先辨識畫面主體，再逐項記錄支持判斷的可見證據。請區分實物、模型公仔、包裝與印刷招牌；招牌上的清晰文字可以識別食物或商品，但不能說看到實際商品。多件商品用群組名稱，不要憑空挑一件。',
        '不要推論畫面中的故事、用途或互動。model 只能填照片中清楚可讀的型號字樣，不能填品牌或系列名稱；不確定時填 null。看不到品牌、新舊或價格時也填 null；不要估價，價格由下一階段處理。',
        '若圖片無法讀取、不是商品或相關招牌、主體不明、或信心低於 0.65，設定 recognizable:false。',
        '只回覆 JSON：{"recognizable":true,"name":"可見主體名稱","brand":null,"model":null,"category":"品類或 null","condition":null,"evidence":["可見證據"],"uncertainties":["待確認事項"],"confidence":0.8}',
    ].join('\n');
}

async function readBoundedImage(url: string, config: OllamaVisionConfig, fetchImpl: Fetch): Promise<Buffer> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !config.allowedImageHosts.includes(parsed.hostname.toLowerCase())) {
        throw new VisionError('Image host is not approved for server-side download', 'VISION_UNSAFE_URL');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    timer.unref?.();
    try {
        const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
        if (!response.ok || !response.body) throw new VisionError('Image could not be downloaded', 'VISION_IMAGE_FETCH');
        const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType || '')) throw new VisionError('Image format is unsupported', 'VISION_IMAGE_FORMAT');
        if (Number(response.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) throw new VisionError('Image is too large', 'VISION_IMAGE_SIZE');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > MAX_IMAGE_BYTES) {
                await reader.cancel();
                throw new VisionError('Image is too large', 'VISION_IMAGE_SIZE');
            }
            chunks.push(value);
        }
        if (!length) throw new VisionError('Image was empty', 'VISION_IMAGE_FORMAT');
        return Buffer.concat(chunks, length);
    } catch (error: any) {
        if (error instanceof VisionError) throw error;
        throw new VisionError('Image download failed', controller.signal.aborted ? 'VISION_TIMEOUT' : 'VISION_IMAGE_FETCH');
    } finally { clearTimeout(timer); }
}

export async function understandImage(url: string, config: OllamaVisionConfig, fetchImpl: Fetch = fetch): Promise<VisionEvidence> {
    const original = await readBoundedImage(url, config, fetchImpl);
    let prepared: Buffer;
    try {
        prepared = await sharp(original, { limitInputPixels: 40_000_000 }).rotate()
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new VisionError('Image could not be decoded', 'VISION_IMAGE_FORMAT'); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    timer.unref?.();
    try {
        const response = await fetchImpl(`${config.baseUrl}/api/chat`, {
            method: 'POST', signal: controller.signal,
            headers: { 'content-type': 'application/json', ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: 'user', content: buildVisionPrompt(), images: [prepared.toString('base64')] }],
                stream: false, format: 'json', think: false, options: { temperature: 0, num_predict: 512 },
            }),
        });
        if (!response.ok) throw new VisionError('Ollama vision request failed', 'VISION_UPSTREAM');
        const data = await response.json() as any;
        if (data?.done !== true || typeof data?.message?.content !== 'string') {
            throw new VisionError('Ollama vision response was invalid', 'VISION_UPSTREAM');
        }
        return parseVisionEvidence(data.message.content);
    } catch (error: any) {
        if (error instanceof VisionError) throw error;
        throw new VisionError('Ollama vision request failed', controller.signal.aborted ? 'VISION_TIMEOUT' : 'VISION_NETWORK');
    } finally { clearTimeout(timer); }
}
