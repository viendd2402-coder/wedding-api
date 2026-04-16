export type GoogleSheetsAuthTestResponse = {
  ok: true;
  credentialSource: 'file' | 'env';
  clientEmail: string;
  /** Có khi không bật skipCreate: Sheet test vừa tạo để mở trên trình duyệt */
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
};
