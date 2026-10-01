/** Real HTTP + Sharp + PostgreSQL + isolated local storage, never Flickr/AI. */
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../../lib/prisma';
import routes from '../../routes/listingMediaRoutes';
import { ListingMediaStorage } from '../../lib/listingMediaStorage';
import { encodeListingPhoto } from '../../lib/listingPhoto';
import { photoUploadHash } from '../../lib/photoUploadReceipt';

require('../../../../scripts/assert-test-database.cjs').assertTestDatabase(process.env.TEST_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) throw Error('Equal isolated DB URLs required');
const secret = 'photo-upload-receipt-isolated-only'; process.env.JWT_SECRET = secret;
const app = express(); app.set('trust proxy', 1); app.use(express.json()); app.use('/api/listing-media', routes);
const server = createServer(app);
let owners: number[] = [], root: string, jpeg: Buffer, otherJpeg: Buffer, sequence = 1;
const savedRoot = process.env.LISTING_MEDIA_STORAGE_ROOT, savedProvider = process.env.LISTING_MEDIA_STORAGE_PROVIDER;
const token = (id: number) => jwt.sign({ id, authVersion: 0 }, secret, { expiresIn: '1h' });
const http = (method: 'get'|'post', route: string, owner = owners[0]) => request(server)[method](route)
    .set('Authorization', 'Bearer '+token(owner)).set('X-Forwarded-For', '192.0.2.'+(sequence++%250+1));
const upload = (id: string = randomUUID(), bytes = jpeg, purpose = 'BATCH_ITEM', owner = owners[0]) => http('post','/api/listing-media',owner)
    .field('clientUploadId',id).field('capturePurpose',purpose).attach('image',bytes,{filename:'synthetic.jpg',contentType:'image/jpeg'});
const read = (id: string, owner = owners[0]) => http('get','/api/listing-media/upload-receipts/'+id,owner);
const abandon = (id: string, hash = photoUploadHash(jpeg,'BATCH_ITEM'), owner = owners[0]) => http('post','/api/listing-media/upload-receipts/'+id+'/abandon',owner).send({requestHash:hash});
beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(),'wishlist-photo-receipt-test-'));
    process.env.LISTING_MEDIA_STORAGE_ROOT = root; process.env.LISTING_MEDIA_STORAGE_PROVIDER = 'local';
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const run=randomUUID(); owners=(await Promise.all(['owner','other'].map(role=>prisma.user.create({data:{phoneNumber:run+role,password:'synthetic-unused',isEmailVerified:true},select:{id:true}})))).map(u=>u.id);
    jpeg=await sharp({create:{width:40,height:30,channels:3,background:'#ff9900'}}).jpeg().toBuffer();
    otherJpeg=await sharp({create:{width:40,height:30,channels:3,background:'#2255cc'}}).jpeg().toBuffer();
});
beforeEach(async () => {
    await prisma.listingMedia.deleteMany({where:{ownerUserId:{in:owners}}});
    await prisma.photoUploadReceipt.deleteMany({where:{userId:{in:owners}}});
    await prisma.user.updateMany({where:{id:{in:owners}},data:{authVersion:0}});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async () => {
    try { if(server.listening)await new Promise<void>(resolve=>server.close(()=>resolve()));
        if(owners.length)await prisma.user.deleteMany({where:{id:{in:owners}}});
        if(root)await fs.rm(root,{recursive:true,force:true}); // Only this suite's fresh mkdtemp.
    } finally {
        if(savedRoot===undefined)delete process.env.LISTING_MEDIA_STORAGE_ROOT;else process.env.LISTING_MEDIA_STORAGE_ROOT=savedRoot;
        if(savedProvider===undefined)delete process.env.LISTING_MEDIA_STORAGE_PROVIDER;else process.env.LISTING_MEDIA_STORAGE_PROVIDER=savedProvider;
        await prisma.$disconnect();
    }
});
describe('durable photo upload proof and cancellation',()=>{
    it('preserves native POST fields and returns private immutable content/purpose proof',async()=>{
        const id=randomUUID(), first=await upload(id), result=await read(id);
        expect(first.status).toBe(201); expect(Object.keys(first.body).sort()).toEqual(['id','imageUrl','thumbnailUrl','width','height','byteSize','createdAt'].sort());
        expect(result.status).toBe(200); expect(result.headers['cache-control']).toBe('private, no-store');
        expect(result.body.receipt).toEqual({clientUploadId:id,requestHash:photoUploadHash(jpeg,'BATCH_ITEM'),state:'STORED',mediaId:first.body.id,createdAt:expect.any(String)});
        expect(result.body.media).toMatchObject({id:first.body.id,ownerUserId:owners[0],clientUploadId:id,capturePurpose:'BATCH_ITEM',listingId:null,wishItemId:null});
        expect(JSON.stringify(result.body)).not.toMatch(/apiKey|password|flickrPhotoId|sellerDraft|authVersion|phoneNumber/);
        expect((await upload(id)).body).toEqual(first.body);
        expect(await prisma.photoUploadReceipt.count({where:{userId:owners[0]}})).toBe(1);
        expect(await prisma.listingMedia.count({where:{ownerUserId:owners[0]}})).toBe(1);
    });
    it('read-only missing receipts never create or cancel uploads',async()=>{
        const id=randomUUID(); expect((await read(id)).status).toBe(404); expect((await read(id)).status).toBe(404);
        expect(await prisma.photoUploadReceipt.count({where:{userId:owners[0]}})).toBe(0);
    });
    it('isolates owner namespaces and canonicalizes letter-case UUIDs',async()=>{
        const id=randomUUID(), first=await upload(id.toUpperCase());
        expect((await read(id,owners[1])).status).toBe(404);
        expect((await upload(id)).body.id).toBe(first.body.id);
        expect((await read(id.toUpperCase())).body.receipt.clientUploadId).toBe(id);
        const other=await upload(id,jpeg,'BATCH_ITEM',owners[1]); expect(other.status).toBe(201); expect(other.body.id).not.toBe(first.body.id);
    });
    it('rejects changed source bytes, workflow and cancellation hashes',async()=>{
        const id=randomUUID(); await upload(id);
        expect((await upload(id,otherJpeg)).status).toBe(409); expect((await upload(id,jpeg,'MANUAL_PHOTO')).status).toBe(409);
        expect((await abandon(id,'f'.repeat(64))).status).toBe(409);
        expect((await read(id)).body.receipt.requestHash).toBe(photoUploadHash(jpeg,'BATCH_ITEM'));
    });
    it('retains immutable proof after binding and after physical deletion, never resurrecting',async()=>{
        const id=randomUUID(), first=await upload(id);
        const list=await prisma.listing.create({data:{ownerUserId:owners[0],clientListingId:randomUUID(),requestHash:'a'.repeat(64),title:'synthetic draft'}});
        await prisma.listingMedia.update({where:{id:first.body.id},data:{listingId:list.id}});
        expect((await read(id)).body.media.listingId).toBe(list.id);
        await prisma.listing.delete({where:{id:list.id}}); await prisma.listingMedia.delete({where:{id:first.body.id}});
        const deleted=await read(id); expect(deleted.body.media).toBeNull(); expect(deleted.body.receipt.mediaId).toBe(first.body.id);
        expect((await upload(id)).status).toBe(409); expect(await prisma.listingMedia.count({where:{ownerUserId:owners[0]}})).toBe(0);
    });
    it('abandon before upload prevents late creation; abandon after upload does not delete',async()=>{
        const canceledId=randomUUID(), canceled=await abandon(canceledId);
        expect(canceled.body).toMatchObject({receipt:{state:'ABANDONED',mediaId:null},media:null});
        expect((await abandon(canceledId)).body).toEqual(canceled.body); expect((await upload(canceledId)).status).toBe(409);
        const storedId=randomUUID(), stored=await upload(storedId), later=await abandon(storedId);
        expect(later.body.receipt.state).toBe('STORED'); expect(later.body.media.id).toBe(stored.body.id);
    });
    it('a canceled request paused after real provider write rolls back its exact local photo',async()=>{
        const write=ListingMediaStorage.prototype.write, id=randomUUID(); let photoId='', resume!:()=>void, admitted!:()=>void;
        const wait=new Promise<void>(resolve=>{resume=resolve;}), admission=new Promise<void>(resolve=>{admitted=resolve;});
        jest.spyOn(ListingMediaStorage.prototype,'write').mockImplementation(async function(this:ListingMediaStorage,mediaId,image,thumbnail){photoId=mediaId;await write.call(this,mediaId,image,thumbnail);admitted();await wait;});
        const task=upload(id).then(r=>r); await admission; expect((await abandon(id)).body.receipt.state).toBe('ABANDONED'); resume();
        expect((await task).status).toBe(409); expect(await prisma.listingMedia.count({where:{ownerUserId:owners[0]}})).toBe(0);
        await expect(fs.access(path.join(root,photoId))).rejects.toThrow();
    });
    it('revocation during provider work prevents late persistence and rolls back storage',async()=>{
        const write=ListingMediaStorage.prototype.write, id=randomUUID(); let resume!:()=>void, admitted!:()=>void;
        const wait=new Promise<void>(resolve=>{resume=resolve;}), admission=new Promise<void>(resolve=>{admitted=resolve;});
        jest.spyOn(ListingMediaStorage.prototype,'write').mockImplementation(async function(this:ListingMediaStorage,mediaId,image,thumbnail){await write.call(this,mediaId,image,thumbnail);admitted();await wait;});
        const task=upload(id).then(r=>r); await admission; await prisma.user.update({where:{id:owners[0]},data:{authVersion:1}});resume();
        expect((await task).status).toBe(401); expect(await prisma.photoUploadReceipt.count({where:{userId:owners[0]}})).toBe(0);
        expect(await prisma.listingMedia.count({where:{ownerUserId:owners[0]}})).toBe(0);
    });
    it('does not forge proof for legacy rows; exact verified retry can establish it without reupload',async()=>{
        const id=randomUUID(), photo=await encodeListingPhoto(jpeg,'image/jpeg'), legacy=await prisma.listingMedia.create({data:{ownerUserId:owners[0],clientUploadId:id.toUpperCase(),capturePurpose:'BATCH_ITEM',contentHash:photo.contentHash,imageUrl:'/old/image',thumbnailUrl:'/old/thumb'}});
        expect((await read(id)).status).toBe(404); expect((await abandon(id)).status).toBe(409);
        const write=jest.spyOn(ListingMediaStorage.prototype,'write');
        expect((await upload(id)).body.id).toBe(legacy.id); expect(write).not.toHaveBeenCalled();
        expect((await read(id)).body.receipt.requestHash).toBe(photoUploadHash(jpeg,'BATCH_ITEM'));
        expect((await prisma.listingMedia.findUniqueOrThrow({where:{id:legacy.id}})).clientUploadId).toBe(id.toUpperCase());
    });
    it('rejects anonymous, extra query/body, invalid UUID/hash and revoked receipt access',async()=>{
        const id=randomUUID(); await upload(id);
        expect((await request(server).get('/api/listing-media/upload-receipts/'+id)).status).toBe(401);
        expect((await read('bad-id')).status).toBe(400); expect((await read(id+'?owner=1')).status).toBe(400);
        expect((await http('post','/api/listing-media/upload-receipts/'+id+'/abandon').send({requestHash:photoUploadHash(jpeg,'BATCH_ITEM'),delete:true})).status).toBe(400);
        expect((await abandon(id,'invalid')).status).toBe(400);
        await prisma.user.update({where:{id:owners[0]},data:{authVersion:1}});
        expect((await read(id)).status).toBe(401); expect((await abandon(id)).status).toBe(401);
    });
});
