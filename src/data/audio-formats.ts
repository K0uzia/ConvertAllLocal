import { formatListStats, parseFormatsSource } from './format-parser.js';

/** Formats audio : web = décodables via Web Audio API + export WAV, MP3 ou OGG (Vorbis). */
const AUDIO_FORMATS_SOURCE = `
.wav .mp3 .ogg .opus .m4a .aac
.flac* .wma* .aiff* .alac* .m4b* .amr* .ac3*
`;

export const audioFormats = parseFormatsSource(AUDIO_FORMATS_SOURCE);
export const audioFormatStats = formatListStats(audioFormats);
