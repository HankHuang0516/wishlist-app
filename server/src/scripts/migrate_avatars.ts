/**
 * 一次性遷移腳本 - 將現有 Flickr 頭像移動到 User Avatars 相簿
 * 
 * 用法: npx ts-node src/scripts/migrate_avatars.ts
 */

import { createFlickr } from 'flickr-sdk';
import prisma from '../lib/prisma';
import dotenv from 'dotenv';

dotenv.config();

const AVATAR_ALBUM_NAME = 'User Avatars';

// 從 Flickr URL 解析 photo_id
// 格式: https://live.staticflickr.com/65535/54190606131_d2f39b0e6e_c.jpg
function extractPhotoId(url: string): string | null {
    const match = url.match(/\/(\d+)_[a-f0-9]+_\w+\.(jpg|png|gif)/i);
    return match ? match[1] : null;
}

async function main() {
    console.log('🔄 開始遷移用戶頭像到 User Avatars 相簿...\n');

    // 檢查 Flickr 憑證
    if (!process.env.FLICKR_API_KEY || !process.env.FLICKR_API_SECRET ||
        !process.env.FLICKR_OAUTH_TOKEN || !process.env.FLICKR_OAUTH_TOKEN_SECRET) {
        console.error('❌ 缺少 Flickr 環境變數');
        process.exit(1);
    }

    const { flickr } = createFlickr({
        consumerKey: process.env.FLICKR_API_KEY!,
        consumerSecret: process.env.FLICKR_API_SECRET!,
        oauthToken: process.env.FLICKR_OAUTH_TOKEN!,
        oauthTokenSecret: process.env.FLICKR_OAUTH_TOKEN_SECRET!
    });

    // 1. 查找或建立 User Avatars 相簿
    console.log('📁 查找 User Avatars 相簿...');
    const photosetsRes = await flickr('flickr.photosets.getList', {
        user_id: process.env.FLICKR_USER_ID || 'me'
    });

    const photosets = photosetsRes.photosets?.photoset || [];
    let avatarPhotosetId = photosets.find((set: any) => set.title._content === AVATAR_ALBUM_NAME)?.id;

    // 2. 查詢需要遷移的用戶頭像
    console.log('🔍 查詢資料庫中的 Flickr 頭像...');
    const usersWithFlickrAvatar = await prisma.user.findMany({
        where: {
            avatarUrl: {
                startsWith: 'https://live.staticflickr.com'
            }
        },
        select: {
            id: true,
            name: true,
            avatarUrl: true
        }
    });

    console.log(`   找到 ${usersWithFlickrAvatar.length} 個需要遷移的頭像\n`);

    if (usersWithFlickrAvatar.length === 0) {
        console.log('✅ 沒有需要遷移的頭像');
        await prisma.$disconnect();
        return;
    }

    // 3. 遷移每個頭像
    let successCount = 0;
    let failCount = 0;

    for (const user of usersWithFlickrAvatar) {
        const photoId = extractPhotoId(user.avatarUrl!);
        if (!photoId) {
            console.log(`⚠️  User ${user.id} (${user.name}): 無法解析 photo_id`);
            failCount++;
            continue;
        }

        try {
            // 如果相簿不存在，用第一張照片建立
            if (!avatarPhotosetId) {
                console.log(`📁 建立 User Avatars 相簿 (主照片: ${photoId})...`);
                const createRes = await flickr('flickr.photosets.create', {
                    title: AVATAR_ALBUM_NAME,
                    description: 'User avatars from Wishlist App',
                    primary_photo_id: photoId
                });
                avatarPhotosetId = createRes.photoset.id;
                console.log(`   ✅ 相簿已建立: ${avatarPhotosetId}`);
                successCount++;
                continue;
            }

            // 新增照片到相簿
            await flickr('flickr.photosets.addPhoto', {
                photoset_id: avatarPhotosetId,
                photo_id: photoId
            });
            console.log(`✅ User ${user.id} (${user.name}): 已移動 photo ${photoId}`);
            successCount++;

        } catch (error: any) {
            // 照片可能已在相簿中
            if (error.message?.includes('Photo already in set')) {
                console.log(`⏭️  User ${user.id} (${user.name}): 照片已在相簿中`);
                successCount++;
            } else {
                console.log(`❌ User ${user.id} (${user.name}): ${error.message}`);
                failCount++;
            }
        }
    }

    console.log('\n📊 遷移完成!');
    console.log(`   ✅ 成功: ${successCount}`);
    console.log(`   ❌ 失敗: ${failCount}`);

    await prisma.$disconnect();
}

main().catch(console.error);
