/**
 * This class wraps the details of the h264 WASM module.
 *
 * Each call to decode() will decode a single encoded element.
 * When decode() returns PIC_RDY, a picture is ready in the output buffer.
 * When you're done decoding, make sure to call release() to clean up internal buffers.
 */
export declare class TinyH264Decoder {
    private tinyH264Module;
    private pStorage;
    private pWidth;
    private pHeight;
    private pPicture;
    private _decBuffer;
    width: number;
    height: number;
    pic: Uint8Array;
    static PIC_RDY: number;
    static RDY: number;
    static HDRS_RDY: number;
    static ERROR: number;
    static PARAM_SET_ERROR: number;
    static MEMALLOC_ERROR: number;
    static create(): Promise<TinyH264Decoder>;
    private constructor();
    release(): void;
    decode(nal: Uint8Array): number;
}
