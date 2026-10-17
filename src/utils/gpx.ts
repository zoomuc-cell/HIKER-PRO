// 활동 기록을 GPX 1.1 파일로 내보내기 (Pro)
import ReactNativeBlobUtil from 'react-native-blob-util';
import {shareFileContent} from './nativeShare';

export type GpxPoint = {
  latitude: number;
  longitude: number;
  altitude?: number;
  timestamp?: number;
};

export type GpxActivity = {
  activityLabel?: string;
  startedAt: number;
  routePoints?: GpxPoint[];
};

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const isoTime = (time?: number) =>
  typeof time === 'number' && Number.isFinite(time) ? new Date(time).toISOString() : null;

const pad = (n: number) => String(n).padStart(2, '0');

export const buildGpx = (activity: GpxActivity) => {
  const date = new Date(activity.startedAt);
  const name = `${activity.activityLabel || '활동'} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const points = (activity.routePoints || []).filter(
    p => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude),
  );
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="HIKER PRO" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${escapeXml(name)}</name>`,
    isoTime(activity.startedAt) ? `    <time>${isoTime(activity.startedAt)}</time>` : '',
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    '    <trkseg>',
    ...points.map(p => {
      const ele = Number.isFinite(p.altitude) ? `<ele>${(p.altitude as number).toFixed(1)}</ele>` : '';
      const time = isoTime(p.timestamp) ? `<time>${isoTime(p.timestamp)}</time>` : '';
      return `      <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">${ele}${time}</trkpt>`;
    }),
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    '',
  ];
  return {name, xml: lines.filter(line => line !== '').join('\n') + '\n'};
};

// GPX 파일을 캐시 폴더에 만들고 공유 시트를 연다
export const exportActivityGpx = async (activity: GpxActivity) => {
  const {name, xml} = buildGpx(activity);
  const safeName = name.replace(/[\\/:*?"<>|\s]+/g, '_');
  const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${safeName}.gpx`;
  await ReactNativeBlobUtil.fs.writeFile(path, xml, 'utf8');
  await shareFileContent('file://' + path, 'application/gpx+xml', `HIKERPRO ${name}`);
};
