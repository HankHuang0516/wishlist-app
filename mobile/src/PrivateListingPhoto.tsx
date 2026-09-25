import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, Text, View } from 'react-native';

type Preview = { uri: string | null; status: 'loading' | 'loaded' | 'failed' };

/** Private thumbnails stay in component memory; native Image requests do not reliably forward auth headers. */
export function PrivateListingPhoto({ thumbnailUrl, localUri, token, label, style }: {
  thumbnailUrl?: string; localUri?: string; token: string; label: string; style: StyleProp<ImageStyle>;
}) {
  const [preview, setPreview] = useState<Preview>({ uri: localUri ?? null, status: 'loading' });
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    let reader: FileReader | null = null;
    setPreview({ uri: localUri ?? null, status: 'loading' });
    if (!localUri && thumbnailUrl) void (async () => {
      try {
        const response = await fetch(thumbnailUrl, { headers: { Authorization: `Bearer ${token}` },
          redirect: 'error', signal: abort.signal });
        if (!response.ok || response.url !== thumbnailUrl || !['image/webp', 'image/jpeg'].includes(response.headers.get('Content-Type')?.split(';')[0].trim() ?? ''))
          throw new Error('Private thumbnail unavailable');
        const blob = await response.blob();
        if (blob.size < 1 || blob.size > 512_000) throw new Error('Invalid private thumbnail size');
        reader = new FileReader();
        const uri = await new Promise<string>((resolve, reject) => {
          reader!.onloadend = () => typeof reader!.result === 'string' ? resolve(reader!.result) : reject(new Error('Private thumbnail unreadable'));
          reader!.onerror = () => reject(new Error('Private thumbnail unreadable'));
          reader!.readAsDataURL(blob);
        });
        if (active) setPreview({ uri, status: 'loading' });
      } catch { if (active) setPreview({ uri: null, status: 'failed' }); }
    })();
    return () => { active = false; abort.abort(); if (reader?.readyState === FileReader.LOADING) reader.abort(); };
  }, [thumbnailUrl, localUri, token]);
  return <View>
    {preview.uri ? <Image key={preview.uri} source={{ uri: preview.uri }} style={style} accessibilityLabel={label}
      onLoad={() => setPreview(old => old.uri === preview.uri ? { ...old, status: 'loaded' } : old)}
      onError={() => setPreview(old => old.uri === preview.uri ? { uri: null, status: 'failed' } : old)} /> : <View style={style} accessibilityLabel={label} />}
    {preview.status === 'failed' && <Text>照片預覽載入失敗；原圖仍安全保存</Text>}
    {__DEV__ && preview.status === 'loaded' && <Text>照片預覽已載入</Text>}
  </View>;
}
