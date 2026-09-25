import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, Text, View } from 'react-native';
import { privateListingThumbnailDataUri } from './privateListingThumbnail';

type Preview = { uri: string | null; status: 'loading' | 'loaded' | 'failed' };

/** Private thumbnails stay in component memory; native Image requests do not reliably forward auth headers. */
export function PrivateListingPhoto({ thumbnailUrl, localUri, apiUrl, token, label, style }: {
  thumbnailUrl?: string; localUri?: string; apiUrl: string; token: string; label: string; style: StyleProp<ImageStyle>;
}) {
  const [preview, setPreview] = useState<Preview>({ uri: localUri ?? null, status: 'loading' });
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setPreview({ uri: localUri ?? null, status: 'loading' });
    if (!localUri && thumbnailUrl) void (async () => {
      try {
        const uri = await privateListingThumbnailDataUri(thumbnailUrl, apiUrl, token, abort.signal, __DEV__);
        if (active) setPreview({ uri, status: 'loading' });
      } catch { if (active) setPreview({ uri: null, status: 'failed' }); }
    })();
    return () => { active = false; abort.abort(); };
  }, [thumbnailUrl, localUri, apiUrl, token]);
  return <View>
    {preview.uri ? <Image key={preview.uri} source={{ uri: preview.uri }} style={style} accessibilityLabel={label}
      onLoad={() => setPreview(old => old.uri === preview.uri ? { ...old, status: 'loaded' } : old)}
      onError={() => setPreview(old => old.uri === preview.uri ? { uri: null, status: 'failed' } : old)} /> : <View style={style} accessibilityLabel={label} />}
    {preview.status === 'failed' && <Text>照片預覽載入失敗；原圖仍安全保存</Text>}
    {__DEV__ && preview.status === 'loaded' && <Text>{label}預覽已載入</Text>}
  </View>;
}
