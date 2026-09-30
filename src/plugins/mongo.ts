import fp from 'fastify-plugin';
import { GridFSBucket, MongoClient } from 'mongodb';

export default fp<{ url: string; dbName: string }>(async (fastify, opts) => {
    const client = new MongoClient(opts.url);
    await client.connect();
    const db = client.db(opts.dbName);

    // GridFS bucket for files (book covers, import files)
    const files = new GridFSBucket(db, { bucketName: 'files' });

    fastify.decorate('mongo', { client, db, files });
    fastify.addHook('onClose', async () => {
        await client.close();
    });
});
