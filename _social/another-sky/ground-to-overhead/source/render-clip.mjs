/** Render the actual explorer at exact frame times. Published app files stay intact.
 * npm ci && npm run render; use --compose-only to revise titles from the clean MP4.
 * FFmpeg with libx264/libass is required on PATH. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';

const sourceDir=dirname(fileURLToPath(import.meta.url));
const project=resolve(sourceDir,'..');
const site=resolve(project,'../../..');
const camera=JSON.parse(await readFile(resolve(sourceDir,'camera-path.json'),'utf8'));
const cleanFile=resolve(sourceDir,'another-sky-ground-to-overhead-v1-clean.mp4');
const finalFile=resolve(project,'exports/another-sky-ground-to-overhead-v1-1080p.mp4');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.jpg':'image/jpeg'};
const engine=await readFile(resolve(site,'another-sky/explorer.js'),'utf8');
const patchedEngine=engine
  .replace('perspective(78*Math.PI/180','perspective((window.__captureFov||78)*Math.PI/180')
  .replace('window.__AS={','window.__AS={captureTime:t=>{worldTime=t;updateTrains();},');
if(patchedEngine===engine||!patchedEngine.includes('captureTime:t'))throw new Error('Capture hooks could not be installed.');
await mkdir(resolve(project,'exports'),{recursive:true});
await mkdir(resolve(project,'previews'),{recursive:true});

function startEncoder(args) {
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y',...args],{cwd:sourceDir,stdio:['pipe','ignore','pipe']});
  let diagnostics='';child.stderr.on('data',chunk=>{diagnostics+=chunk.toString();});
  const done=new Promise((accept,reject)=>{
    child.on('error',reject);
    child.on('close',code=>code===0?accept():reject(new Error(`FFmpeg failed (${code}): ${diagnostics}`)));
  });
  done.catch(()=>{});child.stdin.on('error',()=>{});
  return {child,done};
}

if(!process.argv.includes('--compose-only')) {
  const server=createServer(async(req,res)=>{
    try {
      let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(path.endsWith('/'))path+='index.html';
      const file=resolve(site,'.'+path);
      if(!file.startsWith(site+sep)){res.writeHead(403);res.end();return;}
      const body=path==='/another-sky/explorer.js'?patchedEngine:await readFile(file);
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(body);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const browser=await chromium.launch({args:process.env.CAPTURE_SOFTWARE==='1'?['--enable-unsafe-swiftshader']:['--use-gl=angle','--use-angle=gl']});
  let encoder;const started=Date.now();
  try {
    const page=await browser.newPage({viewport:{width:camera.width,height:camera.height},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/another-sky/`);
    await page.waitForFunction(()=>window.__AS?.ready,null,{timeout:90000});
    await page.evaluate(camera=>{
      const a=window.__AS;a.freeze(true);a.setQuality('high');a.teleport(camera.locationIndex);a.setLighting(0);
      const gl=document.querySelector('#world').getContext('webgl2');
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      window.__captureGpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      window.__captureFrame=time=>{
        const u=Math.max(0,Math.min(1,(time-camera.tiltStartsAt)/(camera.tiltEndsAt-camera.tiltStartsAt)));
        const eased=u*u*u*(u*(u*6-15)+10);
        a.player.pitch=camera.startPitch+(camera.endPitch-camera.startPitch)*eased;
        a.player.yaw=camera.startYaw+(camera.endYaw-camera.startYaw)*eased;
        window.__captureFov=camera.startFieldOfView+(camera.endFieldOfView-camera.startFieldOfView)*eased;
        a.captureTime(time);a.draw();gl.finish();
      };
    },camera);
    await page.addStyleTag({content:'#ui,#veil,#boot,#transition,.overlay{display:none!important}'});
    console.log('Renderer:',await page.evaluate(()=>window.__captureGpu));
    encoder=startEncoder([
      '-f','image2pipe','-framerate',String(camera.fps),'-vcodec','png','-i','pipe:0',
      '-an','-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-c:v','libx264','-preset','medium','-crf','16',
      '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
      '-movflags','+faststart','-metadata','title=Another Sky — clean camera capture',cleanFile
    ]);
    const frames=Math.round(camera.fps*camera.durationSeconds);
    for(let frame=0;frame<frames;frame++) {
      if(encoder.child.exitCode!==null)await encoder.done;
      await page.evaluate(time=>window.__captureFrame(time),frame/camera.fps);
      const png=await page.screenshot({type:'png'});
      if(!encoder.child.stdin.write(png))await once(encoder.child.stdin,'drain');
      if(frame%90===0||frame===frames-1)console.log(`Captured ${frame+1}/${frames} frames (${Math.round((Date.now()-started)/1000)}s elapsed)`);
    }
    encoder.child.stdin.end();await encoder.done;
    if(errors.length)throw new Error(errors.join('\n'));
    const manifest={createdAt:new Date().toISOString(),camera,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:site,encoding:'utf8'}).trim(),rendererSha256:createHash('sha256').update(engine).digest('hex'),renderer:await page.evaluate(()=>window.__captureGpu),frames,fps:camera.fps,width:camera.width,height:camera.height,captureSeconds:Math.round((Date.now()-started)/1000),errors};
    await writeFile(resolve(sourceDir,'render-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  }finally {
    if(encoder&&encoder.child.exitCode===null)encoder.child.kill('SIGTERM');
    await browser.close();await new Promise(done=>server.close(done));
  }
}
await stat(cleanFile);
console.log('Adding editable titles…');
const composed=startEncoder([
  '-i',cleanFile,'-an','-vf','ass=titles.ass',
  '-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p',
  '-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
  '-movflags','+faststart','-metadata','title=Another Sky — Look up',
  '-metadata','artist=San Kala','-metadata','comment=Captured inside the interactive O’Neill cylinder at dysonswarm.com/another-sky/',finalFile
]);
composed.child.stdin.end();await composed.done;
console.log('Ready:',finalFile);
