export interface RuntimeResource {
    start?(): Promise<void>;
    close?(): Promise<void>;
}
