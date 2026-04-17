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
  MAIL_HOST: string;
  MAIL_PORT: number;
  MAIL_USER: string;
  MAIL_PASS: string;
  MAIL_FROM: string;
  RESET_PASSWORD_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  GOOGLE_CLIENT_ID: string;
  FACEBOOK_APP_ID: string;
  FRONTEND_URL: string;
  PAYOS_CLIENT_ID: string;
  PAYOS_API_KEY: string;
  PAYOS_CHECKSUM_KEY: string;
  PAYMENT_PROVIDER: string;
  PUBLIC_API_BASE_URL: string;
  VNPAY_TMN_CODE: string;
  VNPAY_HASH_SECRET: string;
  VNPAY_PAYMENT_URL: string;
  GOOGLE_SHEETS_EDITOR_EMAIL: string;
  GOOGLE_SHEETS_APPS_SCRIPT_URL: string;
  GOOGLE_SHEETS_APPS_SCRIPT_SECRET: string;
  /** Apex domain cho URL thiệp dạng `https://{sub}.{root}/`, ví dụ `lumierewedding.vn`. Tùy chọn. */
  INVITE_ROOT_DOMAIN: string;
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

  const mailHostInput = config.MAIL_HOST;
  const mailHost =
    typeof mailHostInput === 'string' ? mailHostInput.trim() : '';

  const mailPortInput = config.MAIL_PORT;
  const rawMailPort =
    typeof mailPortInput === 'string' || typeof mailPortInput === 'number'
      ? mailPortInput
      : 2525;
  const mailPort = Number(rawMailPort);
  if (!Number.isInteger(mailPort) || mailPort <= 0 || mailPort > 65535) {
    throw new Error(
      `Invalid MAIL_PORT: "${String(rawMailPort)}". Expected an integer between 1 and 65535.`,
    );
  }

  const mailUserInput = config.MAIL_USER;
  const mailUser =
    typeof mailUserInput === 'string' ? mailUserInput.trim() : '';

  const mailPassInput = config.MAIL_PASS;
  const mailPass =
    typeof mailPassInput === 'string' ? mailPassInput.trim() : '';

  const mailFromInput = config.MAIL_FROM;
  const mailFrom =
    typeof mailFromInput === 'string'
      ? mailFromInput.trim()
      : 'no-reply@wedding.local';

  const resetPasswordUrlInput = config.RESET_PASSWORD_URL;
  const resetPasswordUrl =
    typeof resetPasswordUrlInput === 'string'
      ? resetPasswordUrlInput.trim()
      : 'http://localhost:3000/reset-password';

  const redisHostInput = config.REDIS_HOST;
  const redisHost =
    typeof redisHostInput === 'string' && redisHostInput.trim().length > 0
      ? redisHostInput.trim()
      : 'localhost';

  const redisPortInput = config.REDIS_PORT;
  const rawRedisPort =
    typeof redisPortInput === 'string' || typeof redisPortInput === 'number'
      ? redisPortInput
      : 6379;
  const redisPort = Number(rawRedisPort);
  if (!Number.isInteger(redisPort) || redisPort <= 0 || redisPort > 65535) {
    throw new Error(
      `Invalid REDIS_PORT: "${String(rawRedisPort)}". Expected an integer between 1 and 65535.`,
    );
  }

  const googleClientIdInput = config.GOOGLE_CLIENT_ID;
  const googleClientId =
    typeof googleClientIdInput === 'string' ? googleClientIdInput.trim() : '';

  const facebookAppIdInput = config.FACEBOOK_APP_ID;
  const facebookAppId =
    typeof facebookAppIdInput === 'string' ? facebookAppIdInput.trim() : '';

  const frontendUrlInput = config.FRONTEND_URL;
  const frontendUrl =
    typeof frontendUrlInput === 'string'
      ? frontendUrlInput.trim()
      : 'http://localhost:3000';

  const payosClientIdInput = config.PAYOS_CLIENT_ID;
  const payosClientId =
    typeof payosClientIdInput === 'string' ? payosClientIdInput.trim() : '';

  const payosApiKeyInput = config.PAYOS_API_KEY;
  const payosApiKey =
    typeof payosApiKeyInput === 'string' ? payosApiKeyInput.trim() : '';

  const payosChecksumKeyInput = config.PAYOS_CHECKSUM_KEY;
  const payosChecksumKey =
    typeof payosChecksumKeyInput === 'string'
      ? payosChecksumKeyInput.trim()
      : '';

  const paymentProviderInput = config.PAYMENT_PROVIDER;
  const paymentProvider =
    typeof paymentProviderInput === 'string'
      ? paymentProviderInput.trim().toLowerCase()
      : 'payos';
  const normalizedPaymentProvider =
    paymentProvider === 'vnpay' ? 'vnpay' : 'payos';

  const publicApiBaseUrlInput = config.PUBLIC_API_BASE_URL;
  const publicApiBaseUrl =
    typeof publicApiBaseUrlInput === 'string'
      ? publicApiBaseUrlInput.trim()
      : '';

  const vnpayTmnCodeInput = config.VNPAY_TMN_CODE;
  const vnpayTmnCode =
    typeof vnpayTmnCodeInput === 'string' ? vnpayTmnCodeInput.trim() : '';

  const vnpayHashSecretInput = config.VNPAY_HASH_SECRET;
  const vnpayHashSecret =
    typeof vnpayHashSecretInput === 'string'
      ? vnpayHashSecretInput.trim()
      : '';

  const vnpayPaymentUrlInput = config.VNPAY_PAYMENT_URL;
  const vnpayPaymentUrl =
    typeof vnpayPaymentUrlInput === 'string' && vnpayPaymentUrlInput.trim()
      ? vnpayPaymentUrlInput.trim()
      : 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

  const googleSheetsEditorEmailInput = config.GOOGLE_SHEETS_EDITOR_EMAIL;
  const googleSheetsEditorEmail =
    typeof googleSheetsEditorEmailInput === 'string'
      ? googleSheetsEditorEmailInput.trim()
      : '';

  const googleSheetsAppsScriptUrlInput = config.GOOGLE_SHEETS_APPS_SCRIPT_URL;
  const googleSheetsAppsScriptUrl =
    typeof googleSheetsAppsScriptUrlInput === 'string'
      ? googleSheetsAppsScriptUrlInput.trim()
      : '';

  const googleSheetsAppsScriptSecretInput =
    config.GOOGLE_SHEETS_APPS_SCRIPT_SECRET;
  const googleSheetsAppsScriptSecret =
    typeof googleSheetsAppsScriptSecretInput === 'string'
      ? googleSheetsAppsScriptSecretInput.trim()
      : '';

  const inviteRootDomainInput = config.INVITE_ROOT_DOMAIN;
  const inviteRootDomain =
    typeof inviteRootDomainInput === 'string'
      ? inviteRootDomainInput.trim().toLowerCase()
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
    MAIL_HOST: mailHost,
    MAIL_PORT: mailPort,
    MAIL_USER: mailUser,
    MAIL_PASS: mailPass,
    MAIL_FROM: mailFrom,
    RESET_PASSWORD_URL: resetPasswordUrl,
    REDIS_HOST: redisHost,
    REDIS_PORT: redisPort,
    GOOGLE_CLIENT_ID: googleClientId,
    FACEBOOK_APP_ID: facebookAppId,
    FRONTEND_URL: frontendUrl,
    PAYOS_CLIENT_ID: payosClientId,
    PAYOS_API_KEY: payosApiKey,
    PAYOS_CHECKSUM_KEY: payosChecksumKey,
    PAYMENT_PROVIDER: normalizedPaymentProvider,
    PUBLIC_API_BASE_URL: publicApiBaseUrl,
    VNPAY_TMN_CODE: vnpayTmnCode,
    VNPAY_HASH_SECRET: vnpayHashSecret,
    VNPAY_PAYMENT_URL: vnpayPaymentUrl,
    GOOGLE_SHEETS_EDITOR_EMAIL: googleSheetsEditorEmail,
    GOOGLE_SHEETS_APPS_SCRIPT_URL: googleSheetsAppsScriptUrl,
    GOOGLE_SHEETS_APPS_SCRIPT_SECRET: googleSheetsAppsScriptSecret,
    INVITE_ROOT_DOMAIN: inviteRootDomain,
  };
}
