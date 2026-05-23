export type ID = string;

export type Timestamp = {
  seconds: number;
  nanoseconds: number;
};

export type ApiError = {
  code: string;
  message: string;
};

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
