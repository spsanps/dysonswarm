// GLSL. Geometry passes write a small G-buffer (lighting + material/cell ids); the enamel
// passes turn it into cloisonné: gold wire wherever a cell, material or depth changes.
// Noise and layout functions here are twins of world.js; keep them in step.

export const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp isampler2D;
`;

export const COMMON = `
const float R=1353400.;
uint ihash3(ivec3 c){c+=ivec3(2097152);uint h=(uint(c.x)*0x5F356495u)^(uint(c.y)*0x2A3B5C27u)^(uint(c.z)*0x68E31DA4u);
  h=(h^(h>>16))*0x85EBCA6Bu;h=(h^(h>>13))*0xC2B2AE35u;return h^(h>>16);}
float h01(ivec3 c){return float(ihash3(c))*2.3283064e-10;}
float hashf(float a,float b){return h01(ivec3(int(a),int(b),91));}
uint mixh(uint a,uint b){return ihash3(ivec3(int(a&0x3FFFFu),int(b&0x3FFFFu),int((a>>18)^(b>>18))));}
float vnoise3(vec3 p){ivec3 i=ivec3(floor(p));vec3 f=fract(p);vec3 u=f*f*(3.-2.*f);
  float a=h01(i),b=h01(i+ivec3(1,0,0)),c=h01(i+ivec3(0,1,0)),d=h01(i+ivec3(1,1,0));
  float e=h01(i+ivec3(0,0,1)),g=h01(i+ivec3(1,0,1)),h=h01(i+ivec3(0,1,1)),k=h01(i+ivec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,g,u.x),mix(h,k,u.x),u.y),u.z);}
float fbm3(vec3 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vnoise3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
// Voronoi round integer cell base with fractional position f: (F1, F2, id)
vec3 voronoiCellR(ivec3 base,vec3 f,out uint id,out vec3 rn){
  float d1=9.,d2=9.;id=0u;rn=vec3(0);
  for(int k=-1;k<=1;k++)for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    ivec3 o=ivec3(i,j,k);uint h=ihash3(base+o);
    vec3 pt=vec3(o)+.15+.7*vec3(float(h&1023u),float((h>>10)&1023u),float((h>>20)&1023u))/1023.;
    vec3 r=pt-f;float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;id=h;rn=r;}else if(d<d2)d2=d;}
  return vec3(sqrt(d1),sqrt(d2),0.);}
vec3 voronoiCell(ivec3 base,vec3 f,out uint id){vec3 rn;return voronoiCellR(base,f,id,rn);}
vec2 equirect(vec3 d){return vec2(atan(d.y,d.x)/6.2831853+.5,asin(clamp(d.z,-1.,1.))/3.1415927+.5);}
`;

export const GBUF = `
layout(location=0) out vec4 o0;   // direct light, ambient, extra, emissive/8
layout(location=1) out uvec4 o1;  // material, cell, distance bits, aux
uniform float uLogC;
void gbuf(float mat,uint cell,float dist,float direct,float amb,float extra,float emis,float clipW){
  gl_FragDepth=log2(max(1e-6,1.+clipW))*uLogC;
  o0=vec4(clamp(direct,0.,1.),clamp(amb,0.,1.),clamp(extra,0.,1.),clamp(emis/8.,0.,1.));
  o1=uvec4(uint(mat),cell,floatBitsToUint(dist),0u);}
`;

// Lighting shared by the ground and the things on it.
export const LIGHT = `
uniform vec3 uSun;uniform float uNepLit;uniform float uYear;uniform float uTime;
float ambientAt(vec3 n,vec3 up){
  float sunUp=max(dot(up,uSun),0.);
  float bounce=.30*sunUp*.5*(1.-dot(n,up));                       // bright frost below lights the sides
  float nepUp=smoothstep(-.05,.1,up.x);                            // Neptune above the horizon?
  float nep=.035*uNepLit*nepUp*max(n.x*.6+.4,0.);                  // Neptune-light, about a full Moon's
  return bounce+nep+.008;}
`;

// Fields and the analytic shadows of their radiator panels.
export const FIELDS = `
uniform usampler2D uFieldMap;uniform sampler2D uFields;uniform vec2 uFieldMapSize;
const float ROW=250.,FLEN=500.,FGAP=80.,FH=390.,FLEG=30.,AVE=240.;
struct Field{vec3 c;float r;vec3 a;float birth;float years;float kind;float seed;int id;bool ok;};
Field fieldAt(vec3 d){
  Field F;F.ok=false;
  ivec2 t=ivec2(equirect(d)*uFieldMapSize);t.x=t.x%int(uFieldMapSize.x);t.y=clamp(t.y,0,int(uFieldMapSize.y)-1);
  uvec4 m=texelFetch(uFieldMap,t,0);int id=int(m.r+m.g*256u)-1;
  if(id<0)return F;
  vec4 a=texelFetch(uFields,ivec2(id,0),0),b=texelFetch(uFields,ivec2(id,1),0),c=texelFetch(uFields,ivec2(id,2),0);
  F.c=a.xyz/R;F.r=a.w;F.a=b.xyz;F.birth=b.w;F.years=c.x;F.kind=c.y;F.seed=c.z;F.id=id;F.ok=true;return F;}
Field fieldById(int id){
  Field F;vec4 a=texelFetch(uFields,ivec2(id,0),0),b=texelFetch(uFields,ivec2(id,1),0),c=texelFetch(uFields,ivec2(id,2),0);
  F.c=a.xyz/R;F.r=a.w;F.a=b.xyz;F.birth=b.w;F.years=c.x;F.kind=c.y;F.seed=c.z;F.id=id;F.ok=true;return F;}
vec2 fieldUV(Field F,vec3 d){vec3 b=cross(F.a,F.c);vec3 t=d/dot(d,F.c)-F.c;return vec2(dot(t,b),dot(t,F.a))*R;}
float wobble(float th,float seed){return .9+.06*sin(7.*th+seed*6.283)+.04*sin(13.*th+seed*17.);}
float grownF(float birth,float years){return uYear<=birth?0.:min(1.,sqrt((uYear-birth)/years));}
float rowOffset(int f,int k){return float(ihash3(ivec3(f,k,7)))*2.3283064e-10*(FLEN+FGAP);}
float finScale(int f,int k,int i){return .9+.16*float(ihash3(ivec3(f,k,i+101)))*2.3283064e-10;}
// fusion plant clearings (twin of world.js inPlant)
bool inPlant(Field F,float uc,float v){
  if(abs(v+900.)>290.)return false;
  float lim=290.+FLEN*.5;
  return abs(uc-620.)<lim||(F.kind>.5&&abs(uc+620.)<lim);}
// Is there a built panel at row k, along-row position u? Returns its top height (0 if none).
float finAt(Field F,int k,float u){
  float o=rowOffset(F.id,k),P=FLEN+FGAP;float m=u-o;float fi=floor(m/P);
  if(m-fi*P>=FLEN)return 0.;
  float uc=o+fi*P+FLEN*.5;if(abs(uc)-FLEN*.5<AVE)return 0.;
  float v=float(k)*ROW;if(inPlant(F,uc,v))return 0.;float rr=length(vec2(uc,v));float lim=F.r*wobble(atan(v,uc),F.seed);
  if(rr>lim)return 0.;
  float f=rr/lim;if(uYear<F.birth+F.years*f*f)return 0.;
  return FLEG+FH*finScale(F.id,k,int(fi));}
// Sunlight reaching a point at height y above the ground, field coordinates (u, v)?
float finShadow(Field F,vec2 uv,float y,vec3 sunW){
  vec3 b=cross(F.a,F.c);vec3 sl=vec3(dot(sunW,b),dot(sunW,F.c),dot(sunW,F.a));
  if(sl.y<=.002||abs(sl.z)<1e-3)return 1.;
  float dv=sign(sl.z);
  int k0=dv>0.?int(floor(uv.y/ROW+1e-3))+1:int(ceil(uv.y/ROW-1e-3))-1;
  for(int i=0;i<10;i++){
    int k=k0+int(dv)*i;
    float t=(float(k)*ROW-uv.y)/sl.z;
    float hy=y+t*sl.y;
    if(hy>FLEG+FH*1.07)break;
    if(hy<FLEG)continue;
    float top=finAt(F,k,uv.x+t*sl.x);
    if(top>0.&&hy<top)return 0.;
  }
  return 1.;}
`;

// ---------------------------------------------------------------------------
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUV;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

// The region map: cap, cantaloupe, fallout streaks and the blue collar, from the noise.
export const REGION_FS = HEAD + COMMON + `
in vec2 vUV;out vec4 o;
void main(){
  float lon=(vUV.x-.5)*6.2831853,lat=(vUV.y-.5)*3.1415927;
  vec3 n=vec3(cos(lat)*cos(lon),cos(lat)*sin(lon),sin(lat));
  // the south polar cap of nitrogen and methane frost, with a ragged edge near 15–25° S
  float edge=radians(-17.)+radians(10.)*(fbm3(n*2.6+3.)-.5)*2.+radians(4.)*sin(lon*3.+1.);
  float cap=smoothstep(edge+.012,edge-.012,lat);
  // cantaloupe terrain, mostly in the west of the Neptune-facing side and north of the cap
  float cz=fbm3(n*1.4+11.)+.16*cos(lon+.55)+.08*smoothstep(-.2,.5,lat);
  float cant=smoothstep(.57,.63,cz)*(1.-smoothstep(edge+.02,edge-.05,lat));
  // dark fallout streaks on the cap, long and trending north-east, like Voyager 2's
  vec3 e=normalize(vec3(-n.y,n.x,0.)+1e-5);vec3 nn=cross(n,e);vec3 t=normalize(e+nn);
  vec3 q=n*18.;q-=t*dot(q,t)*.86;
  float streak=smoothstep(.69,.75,fbm3(q+vec3(4.,1.,7.)))*cap*smoothstep(radians(-78.),radians(-55.),lat)*smoothstep(radians(-12.),radians(-30.),lat);
  float collar=smoothstep(.05,.0,abs(lat-edge-.03))*(1.-cap);
  o=vec4(cap,cant,streak,collar);
}`;

// ---------------------------------------------------------------------------
// The sky: Neptune (bands, storm, its narrow rings), the Sun as a gilt star, stars.
export const SKY_FS = HEAD + COMMON + GBUF + `
in vec2 vUV;
uniform mat4 uInvVP;uniform vec3 uSunDir;uniform vec3 uNepDir;uniform float uNepAng;uniform vec3 uNepPole;
uniform float uNepSpin;uniform float uPixAng;uniform float uSS;
vec4 bands(float lat,float lon,out uint cell){
  float w=lat+.022*sin(lon*2.+lat*5.)+.012*sin(lon*5.-1.3);
  float E[9]=float[9](-.92,-.7,-.5,-.5,-.2,.12,.45,.45,.8);
  float s=sin(w);int band=0;for(int i=0;i<9;i++)if(s>E[i])band=i+1;
  float T[10]=float[10](.32,.52,.42,.66,.5,.72,.58,.46,.6,.4);
  float b=T[band];cell=uint(band)+100u;float storm=0.;
  // a dark storm with bright companion clouds (illustrative: Neptune's storms come and go)
  vec2 sp=vec2((mod(lon-1.1+3.14159,6.28318)-3.14159)*cos(lat),lat+.37);
  float spot=length(sp*vec2(.55,1.25));
  if(spot<.11){b=.14;cell=200u;storm=1.;}
  vec2 cp=sp-vec2(.1,-.085);
  if(length(cp*vec2(.35,2.2))<.075){b=.96;cell=201u;storm=2.;}
  float str=smoothstep(.70,.9,vnoise3(vec3(lon*1.4,lat*14.,3.)))*smoothstep(.10,.0,abs(lat-.47));
  str+=smoothstep(.74,.92,vnoise3(vec3(lon*1.2+4.,lat*12.,5.)))*smoothstep(.09,.0,abs(lat+.55));
  if(str>.35&&storm==0.){b=mix(b,1.,.85);cell=300u+uint(band)+(str>.6?20u:0u);}
  return vec4(b,storm,str,0.);}
float star4(vec2 p,float r){vec2 a=abs(p)/r;return max(max(1.-a.x-a.y*3.2,1.-a.y-a.x*3.2),1.-length(p)/(r*.32));}
void main(){
  vec4 a=uInvVP*vec4(vUV*2.-1.,-1.,1.);vec3 d=normalize(a.xyz/a.w);
  float mat=0.,extra=0.,emis=0.,direct=0.,amb=0.;uint cell=7u;
  // stars on a cube grid, drawn as gilt four-point stars of constant size on screen
  vec3 ad=abs(d);vec2 suv;int face;
  if(ad.x>ad.y&&ad.x>ad.z){suv=d.yz/ad.x;face=d.x>0.?0:1;}else if(ad.y>ad.z){suv=d.xz/ad.y;face=d.y>0.?2:3;}else{suv=d.xy/ad.z;face=d.z>0.?4:5;}
  for(int L=0;L<2;L++){
    float sc=L==0?14.:70.;vec2 g=suv*sc;ivec2 id=ivec2(floor(g));vec2 f=fract(g);
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
      ivec2 c=id+ivec2(i,j);uint h=ihash3(ivec3(c,face*3+L));
      float pr=L==0?.16:.5;if(float(h&255u)/255.>pr)continue;
      vec2 pc=vec2(c)+.2+.6*vec2(float((h>>8)&255u),float((h>>16)&255u))/255.;
      vec2 off=(g-pc)/sc;                 // in cube-face units ≈ radians near the face centre
      vec2 o2=off/uPixAng/uSS;            // in CSS pixels (near enough)
      float size=L==0?(4.+7.*float(h>>28)/15.):1.1;
      float s=L==0?star4(o2,size):1.-length(o2)/size;
      if(s>0.){mat=12.;extra=L==0?s:.0;emis=L==0?1.:.4;cell=h|1u;}
    }
  }
  // the Sun: 1 arcminute across from 30 AU, drawn as a gilt star
  float sd=acos(clamp(dot(d,uSunDir),-1.,1.));
  if(sd<uPixAng*30.*uSS){
    vec3 e1=normalize(cross(uSunDir,abs(uSunDir.z)<.9?vec3(0,0,1):vec3(1,0,0))),e2=cross(uSunDir,e1);
    vec2 sp=vec2(dot(d,e1),dot(d,e2))/uPixAng/uSS;
    float s=max(star4(sp,22.),star4(mat2(.7071,.7071,-.7071,.7071)*sp,13.));
    if(s>0.){mat=11.;extra=s;emis=6.;cell=11u;}
  }
  float dist=3e12;
  // Neptune, ray-traced
  float r=uNepAng,b=dot(d,uNepDir),disc=b*b-(1.-r*r),tN=1e9;
  if(disc>0.){
    tN=b-sqrt(disc);vec3 p=d*tN-uNepDir,n=p/r;
    vec3 e1=normalize(cross(uNepPole,abs(uNepPole.y)<.9?vec3(0,1,0):vec3(1,0,0))),e2=cross(uNepPole,e1);
    float lat=asin(clamp(dot(n,uNepPole),-1.,1.)),lon=atan(dot(n,e2),dot(n,e1))+uNepSpin;
    vec4 nb=bands(lat,lon,cell);
    float mu0=dot(n,uSunDir),mu=max(dot(n,-d),0.);
    direct=clamp(pow(max(mu0,0.),.86)*pow(max(mu,.02),-.14),0.,1.);
    amb=.02+.06*pow(1.-mu,3.)*smoothstep(-.1,.3,mu0)+.05*smoothstep(-.12,0.,mu0)*smoothstep(.08,0.,mu0);
    mat=9.;extra=nb.x;emis=0.;dist=2e12;
  }
  // rings: only the two narrow ones (Le Verrier, and Adams with its arcs) are drawn, and far
  // brighter than they really are; the broad faint ones would not show at all
  float dn=dot(d,uNepPole);
  if(abs(dn)>1e-5){
    float tr=dot(uNepDir,uNepPole)/dn;
    if(tr>0.&&abs(tr-b)<3.*r){
      vec3 q=(d*tr-uNepDir)/r;float rho=length(q);
      float rw=max(.010,fwidth(rho)*1.3);
      float ring=.8*smoothstep(rw,0.,abs(rho-2.148));
      float ad2=smoothstep(rw*1.1,0.,abs(rho-2.541));
      vec3 e1=normalize(cross(uNepPole,vec3(0,1,0))),e2=cross(uNepPole,e1);
      float an=atan(dot(q,e2),dot(q,e1))+uNepSpin*.07,arcs=0.;
      for(int i=0;i<4;i++){float c=1.2+float(i)*.16;arcs+=smoothstep(.05,0.,abs(mod(an-c+3.14159,6.28318)-3.14159));}
      ring+=ad2*(.8+2.2*min(arcs,1.));
      float along=dot(q,uSunDir);vec3 perp=q-along*uSunDir;
      float lit=(along<0.&&length(perp)<1.)?0.:1.;
      if(ring>.3&&(tr<tN||disc<=0.)){mat=10.;cell=rho<2.35?400u:401u;direct=lit;amb=0.;extra=0.;dist=1.9e12;}
    }
  }
  gbuf(mat,cell,dist,direct,amb,extra,emis,1e20);
  gl_FragDepth=1.;
}`;

// ---------------------------------------------------------------------------
// Terrain chunks.
export const TERRAIN_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;
uniform mat4 uVP;uniform vec3 uOff; // chunk centre minus camera
out vec3 vLocal;out vec3 vN;out vec3 vRel;out float vClipW;
void main(){vLocal=aPos;vN=aNrm;vRel=aPos+uOff;gl_Position=uVP*vec4(vRel,1.);vClipW=gl_Position.w;}`;

export const TERRAIN_FS = HEAD + COMMON + GBUF + LIGHT + FIELDS + `
in vec3 vLocal;in vec3 vN;in vec3 vRel;in float vClipW;
uniform vec3 uChunkF;uniform ivec3 uCI[8];uniform vec3 uCF[8];uniform float uCellS[8];
uniform sampler2D uRegion;uniform float uMinPx;uniform float uFinRing;uniform float uPixAng;
void main(){
  vec3 d=normalize(uChunkF+vLocal);float dist=length(vRel);
  vec3 n=normalize(vN);
  float fp=max(max(length(dFdx(vRel)),length(dFdy(vRel))),1e-4);              // metres per pixel (the longer way)
  vec4 rm=textureLod(uRegion,equirect(d),0.);
  float fine=vnoise3(d*(R/9000.))-.5;                                          // wobbles region edges
  float region=2.;                       // 0 cap, 1 cantaloupe, 2 plains, 3 streak, 4 field (far), 5 collar, 6 avenue
  if(rm.g+fine*.1>.5)region=1.;
  if(rm.a+fine*.1>.55)region=5.;
  if(rm.r+fine*.1>.5)region=0.;
  if(region==0.&&rm.b+fine*.12>.5)region=3.;
  uint cell=uint(region)*977u+13u;
  // cloisons: Voronoi cells at several sizes; finer ones appear as you come closer
  // each cell decides from its own centre whether it is big enough on screen to show, so the
  // wire never traces anything but cell borders
  for(int k=0;k<8;k++){
    float px=uCellS[k]/fp;
    if(px<uMinPx*.3)break;
    if(px>6000.)continue;
    vec3 q=uCF[k]+vLocal/uCellS[k];ivec3 base=uCI[k]+ivec3(floor(q));uint id;vec3 rn;
    voronoiCellR(base,fract(q),id,rn);
    vec3 cRel=vRel+rn*uCellS[k];vec3 cDir=normalize(uChunkF+vLocal+rn*uCellS[k]);
    float cd=length(cRel),graze=max(abs(dot(cRel/cd,cDir)),.18);
    float cpx=uCellS[k]*graze/(cd*uPixAng);
    if(cpx>uMinPx*(.75+.6*float(id&255u)/255.))cell=mixh(cell,id);
  }
  float direct=max(dot(n,uSun),0.)*smoothstep(-.012,.02,dot(d,uSun)),y=0.;
  Field F=fieldAt(d);
  if(F.ok){
    vec2 uv=fieldUV(F,d);float rr=length(uv);float lim=F.r*wobble(atan(uv.y,uv.x),F.seed);
    float g=grownF(F.birth,F.years);
    if(rr<lim*g){
      if(dist>uFinRing){region=4.;cell=uint(F.id)*31u+7u;
        for(int k=0;k<3;k++){float px=uCellS[k]/fp;if(px<uMinPx*.7||px>5000.)continue;
          vec3 q=uCF[k]+vLocal/uCellS[k];uint id;voronoiCell(uCI[k]+ivec3(floor(q)),fract(q),id);cell=mixh(cell,id);}
      } else if(abs(uv.x)<AVE*.55){region=6.;cell=mixh(cell,uint(F.id)*3u+5001u);}
      if(region!=4.)direct*=finShadow(F,uv,1.,uSun);
    } else if(rr<lim) direct*=finShadow(F,uv,1.,uSun);
  }
  float amb=ambientAt(n,d);
  gbuf(1.,cell,dist,direct,amb,(region+.5)/8.,0.,vClipW);
}`;

// ---------------------------------------------------------------------------
// Instanced boxes: radiator panels, halls, legs and pylons, people, the rover.
export const INST_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;layout(location=2) in vec3 aLoc;
layout(location=3) in vec3 iPos;layout(location=4) in vec3 iUp;layout(location=5) in vec3 iAlong;
layout(location=6) in vec3 iSize;layout(location=7) in vec4 iInfo;   // kind, seed, birth, extra
uniform mat4 uVP;uniform vec3 uOrigin;uniform float uYear;uniform float uRing;
out vec3 vRel;out vec3 vN;out vec3 vLoc;out vec3 vSize;flat out vec4 vInfo;out float vClipW;out float vY;
void main(){
  vec3 X=iAlong,Y=iUp,Z=cross(X,Y);
  int kind=int(iInfo.x+.5);
  float grow=1.;
  if(kind==2||kind==9||kind==3||kind==10)grow=smoothstep(iInfo.z,iInfo.z+(kind==3||kind==10?.3:2.5),uYear);
  vec3 base=uOrigin+iPos;
  if(kind==2)grow*=smoothstep(uRing,uRing*.8,length(base));
  vec3 p=vec3(aPos.x*iSize.x,aPos.y*iSize.y*grow,aPos.z*iSize.z);
  vRel=base+X*p.x+Y*p.y+Z*p.z;
  vN=normalize(X*aNrm.x/iSize.x+Y*aNrm.y/max(iSize.y*grow,1e-3)+Z*aNrm.z/iSize.z);
  vLoc=aLoc;vSize=vec3(iSize.x,iSize.y*grow,iSize.z);vInfo=iInfo;vY=p.y;
  gl_Position=grow<.001?vec4(2.,2.,2.,1.):uVP*vec4(vRel,1.);vClipW=gl_Position.w;
}`;

export const INST_FS = HEAD + COMMON + GBUF + LIGHT + FIELDS + `
in vec3 vRel;in vec3 vN;in vec3 vLoc;in vec3 vSize;flat in vec4 vInfo;in float vClipW;in float vY;
uniform vec3 uCamF;
void main(){
  float dist=length(vRel);vec3 n=normalize(vN);
  vec3 d=normalize(uCamF+vRel);
  int kind=int(vInfo.x+.5),face=int(vLoc.z+.5);
  uint seed=uint(vInfo.y*65535.);
  float mat=2.,extra=0.,emis=0.;uint cell=seed;
  float direct=max(dot(n,uSun),0.)*smoothstep(-.012,.02,dot(d,uSun));
  if(kind==2){
    // radiator panel: seven panels along, three bands up; the top band is the manifold that
    // carries results to the trunk line (part of the mind, so it takes the gold)
    Field F=fieldById(int(vInfo.w+.5));
    vec2 uv=fieldUV(F,d);
    direct*=finShadow(F,uv,FLEG+vY,uSun);
    float along=(face==0||face==1)?.5:vLoc.x,up=vY;
    int panel=int(floor(along*7.)),band=int(floor(up/vSize.y*3.));
    cell=mixh(seed,uint(panel*8+band+(face==5?100:0)+(face>=2&&face<=3?200:0)));
    extra=clamp(up/vSize.y,0.,1.);
    if(up>vSize.y-6.&&face!=3){
      mat=8.;cell=seed*7u+3u;
      float k=abs(uv.x)/60.+uTime*2.+vInfo.y*5.,ph=fract(k);
      float pulse=exp(-pow((ph-.5)*6.,2.))*step(.45,hashf(floor(k),vInfo.y*4000.));
      emis=.3+5.*pulse;extra=pulse;
    }
  } else if(kind==3){
    float u=vLoc.x,v=vLoc.y;
    if(face==2){mat=4.;cell=seed*3u+1u;}
    else{
      mat=3.;cell=mixh(seed,uint(face));
      float L=(face==4||face==5)?vSize.x:vSize.z;
      float x=u*L,y=v*vSize.y;
      vec2 wc=vec2(x/16.,y/11.);vec2 wi=floor(wc),wf=fract(wc);
      float win=step(.3,wf.x)*step(wf.x,.7)*step(.42,wf.y)*step(wf.y,.66)*step(.5,wi.y)*step(wi.y,floor(vSize.y/11.)-1.);
      win*=step(.3,hashf(wi.x+vInfo.y*999.,7.));
      if(win>.5){mat=5.;float lit=step(.3,hashf(wi.x*13.+wi.y+vInfo.y*777.,3.));emis=lit*2.2;extra=lit;cell=mixh(seed,uint(wi.x*64.+wi.y)+9000u);}
    }
    Field F=fieldById(int(vInfo.w+.5));direct*=finShadow(F,fieldUV(F,d),vY+2.,uSun);
  } else if(kind==10){
    // a fusion plant: a cobalt drum ringed with warm windows, under a pale enamel dome whose
    // crown glows where the reactor is; panels of the dome are the cloisons
    int sector=int(floor(vLoc.x*12.)),tier=int(floor(vLoc.y*5.));
    float h=vLoc.y;
    if(face==10){
      mat=24.;cell=mixh(seed,uint(sector)+300u);
      if(h>.17&&h<.25){mat=21.;extra=.55;emis=1.6;cell=mixh(seed,uint(sector)+700u);}
    } else {
      mat=25.;cell=mixh(seed,uint(sector*8+tier)+500u);extra=h;
      if(h>.93){mat=21.;extra=1.;emis=3.;cell=seed*5u+11u;}
    }
    Field F=fieldById(int(vInfo.w+.5));direct*=finShadow(F,fieldUV(F,d),vY+2.,uSun);
  } else if(kind==6){
    mat=6.;int part=int(vInfo.w+.5);cell=uint(part)*11u+seed;extra=float(part)/8.;
    if(part==5&&n.y<.6&&dot(n,cross(vec3(0,0,1),d))>-.2){extra=.9;emis=.35;}
  } else if(kind==7){
    mat=7.;int part=int(vInfo.w+.5);cell=uint(part*16+face)+50u;extra=float(part)/8.;
    if(part==2&&face!=2&&face!=3&&vLoc.y>.35){mat=5.;emis=1.2;extra=1.;}
  } else if(kind==9){mat=13.;cell=seed+uint(floor(vY/60.))*3u+77u;}
  float amb=ambientAt(n,d);
  gbuf(mat,cell,dist,direct,amb,extra,emis,vClipW);
}`;

// ---------------------------------------------------------------------------
// The lattice: trunk and branch lines on pylons, carrying pulses home to the dish.
export const LATTICE_VS = HEAD + `
layout(location=0) in vec2 aT;                  // side −1/1, t 0/1
layout(location=1) in vec3 iA;layout(location=2) in vec3 iB;
layout(location=3) in vec4 iP;                  // width class, birth, path at A (km), path at B (km)
layout(location=4) in float iLeaves;
uniform mat4 uVP;uniform vec3 uCamHi,uCamLo;uniform float uPixAng;uniform float uYear;uniform vec3 uSun;
uniform float uMinNight,uMinDay,uLatW;
out float vPath;out float vDay;out float vDist;out float vClipW;out float vLeaves;
void main(){
  vec3 a=(iA-uCamHi)-uCamLo,b=(iB-uCamHi)-uCamLo;
  // lift a little with distance so coarse terrain far away never swallows the line
  a+=normalize(iA)*length(a)*2e-4;b+=normalize(iB)*length(b)*2e-4;
  vec3 p=mix(a,b,aT.y);float dist=length(p);
  vec3 s=normalize(cross(b-a,p)+1e-6);
  float px=iP.x*uLatW*uPixAng*dist,world=5.;
  float day=smoothstep(-.02,.08,dot(normalize(mix(iA,iB,aT.y)),uSun));
  float need=mix(uMinNight,uMinDay,day);
  float w=max(world,px);
  if(iLeaves<need&&px>world*1.5)w=0.;
  if(iP.y>uYear)w=0.;
  p+=s*aT.x*w;
  gl_Position=w==0.?vec4(2.,2.,2.,1.):uVP*vec4(p,1.);vClipW=gl_Position.w;
  vPath=mix(iP.z,iP.w,aT.y);vDay=day;vDist=dist;vLeaves=iLeaves;
}`;
export const LATTICE_FS = HEAD + COMMON + GBUF + `
in float vPath;in float vDay;in float vDist;in float vClipW;in float vLeaves;
uniform float uTime;uniform float uPixAng;
float pulses(float S,float Vk){float k=vPath/S+uTime*Vk/S;float ph=fract(k);
  return exp(-pow((ph-.5)*5.,2.))*step(.55,h01(ivec3(int(floor(k)),int(vPath/400.),3)));}
void main(){
  // pulses at several spacings; each place shows the one that suits its distance on screen
  float spx=vDist*uPixAng;                 // metres per pixel
  float S0=38.,S1=4.75,S2=.6,S3=.075;      // spacing, km (speed 1.6 spacings a second)
  float l=log2(max(spx*90./1000.,1e-6))/3.;   // which octave: ~90 px between pulses
  float o=clamp(-l,0.,3.);float i0=floor(o),f=fract(o);
  float S[4]=float[4](S0,S1,S2,S3);
  float pa=pulses(S[int(i0)],S[int(i0)]*1.6),pb=pulses(S[min(3,int(i0)+1)],S[min(3,int(i0)+1)]*1.6);
  float pulse=mix(pa,pb,f);
  float emis=(1.-vDay)*(.9+5.*pulse)+vDay*(.15+2.5*pulse);
  gbuf(21.,uint(vLeaves>12.?21:22),vDist,vDay,0.,pulse,emis,vClipW);
}`;

// ---------------------------------------------------------------------------
// The dish that sends results home: a lathe mesh in its own frame.
export const DISH_VS = HEAD + `
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNrm;layout(location=2) in vec2 aRS;
uniform mat4 uVP;uniform vec3 uOrigin;uniform mat3 uBasis;
out vec3 vRel;out vec3 vN;out vec2 vRS;out float vClipW;
void main(){vRel=uOrigin+uBasis*aPos;vN=uBasis*aNrm;vRS=aRS;gl_Position=uVP*vec4(vRel,1.);vClipW=gl_Position.w;}`;
export const DISH_FS = HEAD + COMMON + GBUF + LIGHT + `
in vec3 vRel;in vec3 vN;in vec2 vRS;in float vClipW;uniform vec3 uCamF;
void main(){vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;vec3 d=normalize(uCamF+vRel);
  float direct=max(dot(n,uSun),0.)*smoothstep(-.012,.02,dot(d,uSun));uint cell=uint(floor(vRS.x*9.))*64u+uint(floor(vRS.y*24.))+600u;
  float mat=vRS.x>1.5?13.:23.;
  gbuf(mat,cell,length(vRel),direct,ambientAt(n,d),vRS.x/9.,0.,vClipW);}`;

// ---------------------------------------------------------------------------
// Nitrogen geysers, ray-marched: a dark column 8 km up, then a trail dragged downwind.
export const GEYSER_FS = HEAD + COMMON + `
in vec2 vUV;out vec4 o;
uniform mat4 uInvVP;uniform usampler2D uIds;uniform vec3 uSun;uniform float uTime;
uniform vec3 uG[2];uniform vec3 uGUp[2];uniform vec3 uGW[2];uniform int uGN;
float dens(vec3 q){ // q: x downwind, y up (tangent plane), z across
  float h=q.y+(q.x*q.x+q.z*q.z)/(2.*R);
  float lean=pow(smoothstep(4500.,8200.,h),2.)*2600.;
  float rc=260.+h*.07;
  float col=exp(-pow(length(vec2(q.x-lean,q.z))/rc,2.))*smoothstep(0.,300.,h)*(1.-smoothstep(7600.,8600.,h));
  float sx=max(q.x,0.),Ht=8000.-.011*sx,W=650.+.04*sx,T=360.+.007*sx;
  float tr=exp(-pow(q.z/W,2.)-pow((h-Ht)/T,2.))*smoothstep(800.,5000.,q.x)*(1.-smoothstep(90000.,160000.,q.x));
  float n=fbm3(vec3(q.x/2200.-uTime*.02,q.z/900.,h/700.)),n2=vnoise3(vec3(q.x/500.,q.z/300.,h/260.));
  return col*(.5+.9*n)*1.4+tr*(.35+1.1*n*n2)*.8;}
void main(){
  vec4 a=uInvVP*vec4(vUV*2.-1.,-1.,1.);vec3 d=normalize(a.xyz/a.w);
  float sceneD=uintBitsToFloat(texelFetch(uIds,ivec2(gl_FragCoord.xy),0).z);
  vec3 col=vec3(0);float T=1.;
  for(int g=0;g<2;g++){
    if(g>=uGN)break;
    vec3 U=uGUp[g],W=uGW[g],Z=cross(W,U);
    vec3 ro=-uG[g];vec3 rl=vec3(dot(ro,W),dot(ro,U),dot(ro,Z)),dl=vec3(dot(d,W),dot(d,U),dot(d,Z));
    vec3 bmin=vec3(-9000.,-11000.,-9000.),bmax=vec3(165000.,10500.,9000.);
    vec3 inv=1./dl,ta=(bmin-rl)*inv,tb=(bmax-rl)*inv,tmn=min(ta,tb),tmx=max(ta,tb);
    float t0=max(max(tmn.x,tmn.y),max(tmn.z,0.)),t1=min(min(tmx.x,tmx.y),min(tmx.z,sceneD));
    if(t1<=t0)continue;
    vec3 sl=vec3(dot(uSun,W),dot(uSun,U),dot(uSun,Z));
    const int N=96;float dt=(t1-t0)/float(N);float j=h01(ivec3(ivec2(gl_FragCoord.xy),5));
    for(int i=0;i<N;i++){
      vec3 q=rl+dl*(t0+(float(i)+j)*dt);float de=dens(q);
      if(de>.002){
        float ls=dens(q+sl*500.)+dens(q+sl*1500.);
        float tr=exp(-ls*.6),ph=.35+.9*pow(max(dot(dl,sl),0.),6.);
        vec3 c=vec3(.78,.74,.72)*tr*ph*1.4+vec3(.05,.06,.09);
        float aa=1.-exp(-de*.00042*dt);col+=T*aa*c;T*=1.-aa;if(T<.02)break;
      }
    }
  }
  o=vec4(col,1.-T);
}`;

// ===========================================================================
// Enamel.
const DECODE = `
uniform sampler2D uL;uniform usampler2D uIds;uniform vec2 uRes;uniform float uSS;
struct S{float mat;uint cell;float dist;float direct;float amb;float extra;float emis;};
S fetchS(ivec2 p){p=clamp(p,ivec2(0),ivec2(uRes)-1);vec4 l=texelFetch(uL,p,0);uvec4 i=texelFetch(uIds,p,0);
  return S(float(i.x),i.y,uintBitsToFloat(i.z),l.x,l.y,l.z,l.w*8.);}
bool isM(S s,float m){return abs(s.mat-m)<.5;}
float cj(uint c,uint k){return float(ihash3(ivec3(int(c&0xFFFFu),int(c>>16),int(k)))&1023u)/1023.;}
vec3 cjit(uint c,float a){return (vec3(cj(c,1u),cj(c,2u),cj(c,3u))-.5)*a;}
`;

export const ENAMEL_BASE = HEAD + COMMON + DECODE + `
out vec4 o;uniform mat4 uInvVP;
void main(){
  ivec2 px=ivec2(gl_FragCoord.xy);S s=fetchS(px);
  float L=clamp(s.direct*1.05+s.amb*1.6,0.,1.25);
  vec3 c=vec3(0);float glow=0.;
  if(s.mat<.5||isM(s,12.)||isM(s,11.)){
    vec4 a=uInvVP*vec4(gl_FragCoord.xy/uRes*2.-1.,-1.,1.);vec3 d=normalize(a.xyz/a.w);
    c=mix(vec3(.05,.085,.30),vec3(.008,.015,.10),.5+.5*sin(d.z*1.3+d.x*.7));
    c*=.92+.12*vnoise3(d*6.);
    if(isM(s,12.)){float x=s.extra;
      if(x>.001){vec3 g=mix(vec3(.55,.36,.12),vec3(1.,.88,.55),smoothstep(0.,.6,x));c=g;glow=.15;}
      else c+=vec3(.9,.7,.3)*s.emis*.6;}
    if(isM(s,11.)){c=mix(vec3(1.,.82,.45),vec3(1.,.99,.92),smoothstep(.2,.8,s.extra));glow=1.;}
  } else if(isM(s,9.)){  // Neptune: lapis to turquoise bands
    float b=s.extra;
    vec3 band=b<.2?vec3(.06,.13,.40):b<.38?vec3(.09,.24,.62):b<.5?vec3(.14,.38,.80):b<.62?vec3(.26,.56,.88):b<.75?vec3(.48,.76,.92):vec3(.80,.92,.97);
    band+=cjit(s.cell,.05);
    c=mix(vec3(.05,.08,.30),band,smoothstep(0.,.55,L));c=mix(c,band*1.08+.04,smoothstep(.75,1.2,L));
  } else if(isM(s,10.)){c=mix(vec3(.12,.15,.36),vec3(.62,.66,.86),s.direct);}
  else if(isM(s,1.)){       // the ground, by region
    float reg=floor(s.extra*8.);
    float j=cj(s.cell,7u);
    vec3 lit,sh;
    if(reg<.5){lit=mix(vec3(.96,.80,.78),vec3(.98,.86,.76),j);if(cj(s.cell,9u)>.84)lit=vec3(.88,.76,.86);sh=mix(vec3(.50,.47,.70),vec3(.58,.52,.72),j);}
    else if(reg<1.5){lit=mix(vec3(.72,.77,.64),vec3(.82,.80,.66),j);sh=vec3(.40,.46,.58);}
    else if(reg<2.5){lit=mix(vec3(.86,.82,.74),vec3(.92,.87,.80),j);sh=vec3(.50,.48,.64);}
    else if(reg<3.5){lit=mix(vec3(.50,.25,.28),vec3(.64,.36,.36),j);sh=vec3(.30,.18,.30);}
    else if(reg<4.5){lit=mix(vec3(.56,.11,.19),vec3(.68,.16,.22),j);sh=vec3(.30,.07,.15);}
    else if(reg<5.5){lit=vec3(.52,.74,.80);sh=vec3(.30,.42,.60);}
    else{lit=mix(vec3(.90,.88,.92),vec3(.84,.84,.90),j);sh=vec3(.46,.46,.64);}
    float Ls=smoothstep(0.,.16,s.direct)*.85+s.amb;
    vec3 night=mix(vec3(.04,.055,.18),vec3(.06,.075,.23),j)+vec3(.02,.035,.09)*smoothstep(.01,.04,s.amb);
    c=mix(sh,lit,smoothstep(.05,.5,Ls));
    c=mix(night,c,smoothstep(.03,.22,Ls));
  } else if(isM(s,2.)){     // pearl-white panels, shaded blue-lavender, deeper at the foot
    vec3 lit=vec3(.97,.96,.93)+cjit(s.cell,.04),sh=vec3(.36,.42,.70)+cjit(s.cell,.05);
    c=mix(sh,lit,smoothstep(.04,.6,L));c*=.80+.22*s.extra;c=mix(c,c*vec3(.92,.95,1.08),.5*(1.-s.extra));
  } else if(isM(s,8.)||isM(s,21.)){c=vec3(1.,.70,.28)*(.8+.4*s.extra);glow=isM(s,21.)?(.5+1.5*s.extra)*(1.-s.direct*.85):1.4*s.extra;}
  else if(isM(s,3.)){c=mix(vec3(.30,.06,.13),vec3(.62,.13,.20),smoothstep(.05,.7,L))+cjit(s.cell,.04);}
  else if(isM(s,4.)){c=mix(vec3(.18,.05,.10),vec3(.40,.10,.16),smoothstep(.05,.7,L));}
  else if(isM(s,5.)){c=s.emis>.5?vec3(1.,.74,.30):vec3(.16,.05,.09);glow=s.emis>.5?.35:0.;}
  else if(isM(s,6.)){c=mix(vec3(.55,.58,.76),vec3(.98,.97,.94),smoothstep(.05,.6,L));if(s.extra>.35&&s.extra<.45)c*=.7;if(s.emis>.1)c=vec3(.95,.68,.22);}
  else if(isM(s,7.)){c=mix(vec3(.55,.58,.76),vec3(.96,.95,.92),smoothstep(.05,.6,L));if(s.extra>.3&&s.extra<.4)c=vec3(.14,.14,.2);}
  else if(isM(s,13.)){c=mix(vec3(.16,.17,.30),vec3(.50,.52,.66),smoothstep(.05,.6,L));}
  else if(isM(s,23.)){c=mix(vec3(.42,.46,.72),vec3(.98,.97,.95),smoothstep(.04,.6,L))+cjit(s.cell,.03);}
  else if(isM(s,24.)){c=mix(vec3(.07,.10,.34),vec3(.20,.32,.78),smoothstep(.05,.7,L))+cjit(s.cell,.03);}
  else if(isM(s,25.)){vec3 lit=mix(vec3(.96,.80,.52),vec3(.99,.93,.74),s.extra)+cjit(s.cell,.035),sh=mix(vec3(.52,.30,.30),vec3(.60,.44,.52),s.extra);
    c=mix(sh,lit,smoothstep(.04,.6,L));}
  // night: every made thing sinks into deep blue glass, with a hint of Neptune-light
  if(isM(s,2.)||isM(s,3.)||isM(s,4.)||isM(s,6.)||isM(s,7.)||isM(s,13.)||isM(s,23.)||isM(s,24.)||isM(s,25.))
    c=mix(c*.16+vec3(.025,.04,.13)+vec3(.02,.03,.07)*smoothstep(.01,.04,s.amb),c,smoothstep(.03,.24,L));
  o=vec4(c,glow);
}`;

// Wire seeds: where cells, materials or depth change. Class 2 is the mind (network), whose wire
// is bright gold day and night; class 1 is every other form, gold by day and dark by night.
export const SEED_FS = HEAD + COMMON + DECODE + `
out ivec4 o;
bool wireless(float m){return m<.5||(m>10.5&&m<12.5);}
bool net(S s){return isM(s,21.)||isM(s,8.);}
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);S a=fetchS(p);
  bool seed=false,isNet=false;float val=0.;
  ivec2 off[4]=ivec2[4](ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1));
  for(int i=0;i<4;i++){
    S b=fetchS(p+off[i]);
    if(wireless(a.mat)&&wireless(b.mat))continue;
    bool e=abs(a.mat-b.mat)>.5||a.cell!=b.cell;
    if(!e&&!isM(a,1.)&&abs(a.dist-b.dist)>.08*min(a.dist,b.dist))e=true;
    if(!e)continue;
    seed=true;
    if(net(a)||net(b)){isNet=true;val=max(val,max(net(a)?a.emis:0.,net(b)?b.emis:0.));}
    else val=max(val,max(a.direct,b.direct));
  }
  o=seed?ivec4(p,isNet?2:1,int(clamp(val,0.,8.)*1000.)):ivec4(-30000,-30000,0,0);
}`;
export const JFA_FS = HEAD + `
out ivec4 o;uniform isampler2D uSrc;uniform int uStep;uniform vec2 uRes;
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy);ivec4 best=ivec4(-30000,-30000,0,0);int bd=1<<30;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    ivec2 q=p+ivec2(i,j)*uStep;
    if(q.x<0||q.y<0||q.x>=int(uRes.x)||q.y>=int(uRes.y))continue;
    ivec4 s=texelFetch(uSrc,q,0);if(s.z==0)continue;
    ivec2 dd=s.xy-p;int d=dd.x*dd.x+dd.y*dd.y;if(d<bd){bd=d;best=s;}
  }
  o=best;}`;
export const BLUR_FS = HEAD + `
in vec2 vUV;out vec4 o;uniform sampler2D uSrc;uniform vec2 uDir;uniform float uFirst;
void main(){vec4 s=vec4(0);float w=0.;
  for(int i=-10;i<=10;i++){float k=exp(-float(i*i)/40.);vec4 t=texture(uSrc,vUV+uDir*float(i));
    s+=k*(uFirst>.5?vec4(t.rgb*t.a,t.a):t);w+=k;}
  o=s/w;}`;

export const ENAMEL_FINAL = HEAD + COMMON + DECODE + `
in vec2 vUV;out vec4 o;
uniform sampler2D uBase,uGlow,uVol;uniform isampler2D uJfa;uniform float uNetW;uniform float uFormW;
void main(){
  vec2 px=gl_FragCoord.xy;
  vec3 col=texture(uBase,vUV).rgb;
  ivec4 j=texelFetch(uJfa,ivec2(px),0);
  S s=fetchS(ivec2(px));
  float d=j.z>0?length(px-vec2(j.xy)):1e5;
  float val=float(j.w)/1000.;
  float dayW=j.z==1?smoothstep(.02,.25,val):1.;
  float hw=(j.z==2?uNetW:uFormW*mix(.48,1.,dayW))*uSS;
  if(isM(s,1.)||isM(s,2.)) hw*=mix(1.05,.75,smoothstep(300.,6000.,s.dist));
  vec2 q=px/uSS;
  // the glass: clouding, frit, pinholes, a meniscus where it meets the wire
  col*=1.+(vnoise3(vec3(q/140.,1.))-.5)*.07;
  float frit=float(ihash3(ivec3(ivec2(q*.9),3))&1023u)/1023.;col+=(step(.985,frit)*.06-step(frit,.012)*.07)*(.4+dot(col,vec3(.3)));
  col=mix(col,col*.35,step(.9993,float(ihash3(ivec3(ivec2(q/2.),4))&65535u)/65535.)*.8);
  float men=smoothstep(hw+7.*uSS,hw,d);col*=1.-.13*men*men;col*=1.+.04*smoothstep(hw+6.*uSS,hw+16.*uSS,d);
  // raised wire throws a short shadow down and to the right
  vec2 sp=px+vec2(-1.4,1.4)*uSS;ivec4 js=texelFetch(uJfa,ivec2(sp),0);
  float ds=js.z>0?length(sp-vec2(js.xy)):1e5;if(d>hw&&ds<hw)col*=.72;
  if(d<hw){
    vec2 dir=(px-vec2(j.xy))/max(d,1e-3);float x=clamp(d/hw,0.,1.);
    vec3 n=normalize(vec3(dir*x,sqrt(max(1.-x*x,0.))*.8)),l=normalize(vec3(-.55,.6,.6));
    float dif=max(dot(n,l),0.),spec=pow(max(dot(reflect(-l,n),vec3(0,0,1)),0.),26.),env=.55+.45*n.y;
    vec3 gold=mix(vec3(.30,.18,.06),vec3(1.,.80,.42),dif*.75+env*.35)+vec3(1.,.95,.8)*spec*.85;
    if(j.z==2)gold=mix(gold,vec3(1.,.95,.78)*1.25,clamp((val-.6)*.25,0.,.9));
    else{vec3 dark=mix(vec3(.05,.06,.16),vec3(.20,.18,.30),dif*.6+env*.3)+vec3(.3,.3,.45)*spec*.25;gold=mix(dark,gold,dayW);}
    col=gold;
  }
  // the geysers in wireless (musen) enamel: soft pale glass over whatever is behind
  vec4 v=texture(uVol,vUV);
  vec3 musen=mix(vec3(.80,.80,.92),vec3(.97,.96,.98),smoothstep(.2,.9,v.a));
  col=mix(col,musen*(.92+.08*vnoise3(vec3(q/30.,2.))),smoothstep(.02,.75,v.a)*.92);
  col+=texture(uGlow,vUV).rgb*vec3(1.,.82,.55)*1.25;
  // polish: one broad soft reflection and a vignette
  col+=smoothstep(.9,0.,abs((vUV.x*.8+vUV.y*1.1)-1.15))*.022*(.6+.4*vnoise3(vec3(q/9.,5.)));
  col*=1.-.22*pow(length((vUV-.5)*vec2(1.,1.1)),2.4);
  col=clamp(col,0.,1.);
  o=vec4(mix(col*12.92,1.055*pow(col,vec3(1./2.4))-.055,step(.0031308,col)),1.);
}`;
