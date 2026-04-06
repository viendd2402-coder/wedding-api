type AppEnv = {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SYNC: boolean;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: number;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_S3_PUBLIC_BASE_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
};

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const nodeEnvInput = config.NODE_ENV;
  const nodeEnvValue =
    typeof nodeEnvInput === 'string' && nodeEnvInput.length > 0
      ? nodeEnvInput
      : 'development';
  const allowedNodeEnvs = ['development', 'test', 'production'] as const;

  if (!allowedNodeEnvs.includes(nodeEnvValue as AppEnv['NODE_ENV'])) {
    throw new Error(
      `Invalid NODE_ENV: "${nodeEnvValue}". Expected one of ${allowedNodeEnvs.join(', ')}.`,
    );
  }

  const rawPortInput = config.PORT;
  const rawPort =
    typeof rawPortInput === 'string' || typeof rawPortInput === 'number'
      ? rawPortInput
      : 3000;
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      `Invalid PORT: "${String(rawPort)}". Expected an integer between 1 and 65535.`,
    );
  }

  const jwtSecretInput = config.JWT_SECRET;
  const jwtSecret =
    typeof jwtSecretInput === 'string' && jwtSecretInput.trim().length > 0
      ? jwtSecretInput
      : 'wedding-dev-secret';

  const jwtExpiresInInput = config.JWT_EXPIRES_IN;
  const rawJwtExpiresIn =
    typeof jwtExpiresInInput === 'string' ||
    typeof jwtExpiresInInput === 'number'
      ? jwtExpiresInInput
      : 86400;
  const jwtExpiresIn = Number(rawJwtExpiresIn);

  if (!Number.isInteger(jwtExpiresIn) || jwtExpiresIn <= 0) {
    throw new Error(
      `Invalid JWT_EXPIRES_IN: "${String(rawJwtExpiresIn)}". Expected positive integer (seconds).`,
    );
  }

  const dbHostInput = config.DB_HOST;
  const dbHost =
    typeof dbHostInput === 'string' && dbHostInput.trim().length > 0
      ? dbHostInput
      : 'localhost';

  const dbPortInput = config.DB_PORT;
  const rawDbPort =
    typeof dbPortInput === 'string' || typeof dbPortInput === 'number'
      ? dbPortInput
      : 5432;
  const dbPort = Number(rawDbPort);
  if (!Number.isInteger(dbPort) || dbPort <= 0 || dbPort > 65535) {
    throw new Error(
      `Invalid DB_PORT: "${String(rawDbPort)}". Expected an integer between 1 and 65535.`,
    );
  }

  const dbUsernameInput = config.DB_USERNAME;
  const dbUsername =
    typeof dbUsernameInput === 'string' && dbUsernameInput.trim().length > 0
      ? dbUsernameInput
      : 'postgres';

  const dbPasswordInput = config.DB_PASSWORD;
  const dbPassword =
    typeof dbPasswordInput === 'string' ? dbPasswordInput : 'postgres';

  const dbNameInput = config.DB_NAME;
  const dbName =
    typeof dbNameInput === 'string' && dbNameInput.trim().length > 0
      ? dbNameInput
      : 'wedding';

  const dbSyncInput = config.DB_SYNC;
  const dbSync =
    typeof dbSyncInput === 'string'
      ? dbSyncInput.toLowerCase() === 'true'
      : Boolean(dbSyncInput ?? true);

  const awsRegionInput = config.AWS_REGION;
  const awsRegion =
    typeof awsRegionInput === 'string' && awsRegionInput.trim().length > 0
      ? awsRegionInput.trim()
      : 'ap-southeast-1';

  const awsS3BucketInput = config.AWS_S3_BUCKET;
  const awsS3Bucket =
    typeof awsS3BucketInput === 'string' ? awsS3BucketInput.trim() : '';

  const awsS3PublicBaseUrlInput = config.AWS_S3_PUBLIC_BASE_URL;
  const awsS3PublicBaseUrl =
    typeof awsS3PublicBaseUrlInput === 'string'
      ? awsS3PublicBaseUrlInput.trim()
      : '';

  const awsAccessKeyIdInput = config.AWS_ACCESS_KEY_ID;
  const awsAccessKeyId =
    typeof awsAccessKeyIdInput === 'string' ? awsAccessKeyIdInput.trim() : '';

  const awsSecretAccessKeyInput = config.AWS_SECRET_ACCESS_KEY;
  const awsSecretAccessKey =
    typeof awsSecretAccessKeyInput === 'string'
      ? awsSecretAccessKeyInput.trim()
      : '';

  return {
    NODE_ENV: nodeEnvValue as AppEnv['NODE_ENV'],
    PORT: port,
    DB_HOST: dbHost,
    DB_PORT: dbPort,
    DB_USERNAME: dbUsername,
    DB_PASSWORD: dbPassword,
    DB_NAME: dbName,
    DB_SYNC: dbSync,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    AWS_REGION: awsRegion,
    AWS_S3_BUCKET: awsS3Bucket,
    AWS_S3_PUBLIC_BASE_URL: awsS3PublicBaseUrl,
    AWS_ACCESS_KEY_ID: awsAccessKeyId,
    AWS_SECRET_ACCESS_KEY: awsSecretAccessKey,
  };
}
