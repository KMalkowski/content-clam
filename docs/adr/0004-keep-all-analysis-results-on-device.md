# Keep all analysis results on the device

Content Clam stores settings, accounts, and payment information on the server, but no specific analysis inputs, outputs, or history. The user rejected temporary result storage because it would grow with usage. Process video data in memory and cache completed classifications on the device for 30 days.

Failed requests repeat the work instead of retrieving a server copy. This accepts additional provider cost. Avoid analysis data in logs and durable execution records as well as database tables. ADR 0005 permits temporary billing receipts without video data; it does not permit an analysis history.
