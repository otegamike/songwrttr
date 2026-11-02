export const APP_NAME_DEFAULT = "SongPad";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_DRIVE_SCOPE,
] as const;

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_FILE_FIELDS =
  "id,name,mimeType,size,md5Checksum,parents,trashed";
