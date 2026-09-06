"""Check the deliverable and create human-readable review images. Requires FFmpeg."""
from pathlib import Path
import json, subprocess, struct
root=Path(__file__).resolve().parent.parent
video=root/'exports/another-sky-ground-to-overhead-v1-1080p.mp4'
metadata=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
videos=[s for s in metadata['streams'] if s['codec_type']=='video']
assert len(videos)==1
stream=videos[0]
assert (stream['width'],stream['height'])==(1920,1080)
assert stream['codec_name']=='h264' and stream['pix_fmt']=='yuv420p'
assert stream['r_frame_rate']=='30/1' and int(stream['nb_frames'])==540
assert abs(float(metadata['format']['duration'])-18)<0.01
assert not any(s['codec_type']=='audio' for s in metadata['streams'])
assert stream['color_space']=='bt709'
# Decode the complete deliverable; malformed frames must fail this check.
subprocess.run(['ffmpeg','-v','error','-xerror','-i',str(video),'-f','null','-'],check=True)
atoms=[]
with video.open('rb') as f:
 while f.tell()<video.stat().st_size:
  at=f.tell();header=f.read(8)
  if len(header)!=8:break
  size,kind=struct.unpack('>I4s',header)
  if size==1:size=struct.unpack('>Q',f.read(8))[0]
  if size==0:size=video.stat().st_size-at
  atoms.append((kind.decode('ascii'),at));f.seek(at+size)
assert dict(atoms)['moov']<dict(atoms)['mdat']
previews=root/'previews';previews.mkdir(exist_ok=True)
for time,name in [(0,'opening'),(8,'reveal'),(17,'ending')]:
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(time),'-i',str(video),'-frames:v','1','-q:v','2',str(previews/f'{name}.jpg')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(video),'-vf','fps=1/3,scale=640:360,tile=3x2:padding=8:margin=8:color=0xf1eee3','-frames:v','1','-q:v','2',str(previews/'contact-sheet.jpg')],check=True)
result={'file':video.name,'bytes':video.stat().st_size,'durationSeconds':18,'width':1920,'height':1080,'fps':30,'frames':540,'codec':'H.264','pixelFormat':'yuv420p','colorSpace':'BT.709','audio':'none; intentional silent clip','completeDecode':'passed','fastStart':True,'reviewImages':['opening.jpg','reveal.jpg','ending.jpg','contact-sheet.jpg']}
(previews/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
