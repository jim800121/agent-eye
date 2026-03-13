export interface ConsoleError {
  level: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
  timestamp?: string;
}

export interface NetworkError {
  url: string;
  method: string;
  status: number;
  status_text?: string;
  response_body?: string;
  timestamp?: string;
}
