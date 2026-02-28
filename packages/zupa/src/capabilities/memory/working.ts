// Working memory is a set of N last messages of current session
// This prevents context overflow but can create a hardcut of current session memory
// Maybe we can introduce async message storage, so we don't mess with latency
// but are still able to fetch related messages semantically.
// This mean each message will inevitably get storage at a vector database