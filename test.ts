import fs from 'fs';
import { H264Decoder } from './src';
import { YUV2RBG, RGB2PPM } from './yuv';

const decoder = new H264Decoder();
for (let i = 0; i < 78; i++) {
  const nalu = fs.readFileSync(`assets\\h264samples\\${ i }`);
  const ret = decoder.decode(nalu);
  if (ret === H264Decoder.PIC_RDY){
    const rgb = YUV2RBG(decoder.pic, decoder.width, decoder.height);
    fs.writeFileSync(`${ i }.ppm`, RGB2PPM(rgb, decoder.width, decoder.height));
  }
}