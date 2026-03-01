import qrcode from 'qrcode-terminal';

export function generateAsciiQR(payload: string): Promise<string> {
    return new Promise((resolve) => {
        qrcode.generate(payload, { small: true }, resolve);
    });
}
