function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
    }
    return value;
}

export const config = {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    postgresUrl: requireEnv('POSTGRES_URL'),
    mongoUrl: requireEnv('MONGO_URL'),
    mongoDb: process.env.MONGO_DB ?? 'smart_reading_coach_files',
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
};
