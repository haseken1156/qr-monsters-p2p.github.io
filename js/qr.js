// 入口用のQRだけを作ります。モンスターや素材のQR発行機能はありません。
import {QRCode} from '../vendor/libraries.js';
export async function buildEntryQr(){if(location.protocol!=='https:')return '';const base=new URL(location.href);base.search='';base.hash='';return QRCode.toDataURL(base.href,{width:600,margin:4,errorCorrectionLevel:'M'});}
