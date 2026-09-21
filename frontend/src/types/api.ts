// The envelope every successful backend response follows (see
// backend/src/common/interceptors/response.interceptor.ts). Failed requests
// never reach callers in this shape: the axios interceptor turns them into
// an ApiError (see lib/axios/interceptors.ts), so services only ever see
// the success shape.
export type ApiSuccess<T> = { success: true; data: T };
