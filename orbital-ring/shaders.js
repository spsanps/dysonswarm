/*
 * THE ORBITAL RING: GLSL for the ride renderer.
 * Units: kilometres for the planet, atmosphere and clouds; metres for anything you
 * could touch (the car, the cable, the platform, the station and the ring tube).
 * World axes at the ground station: X along the ring (east at the first platform), Y up, Z the
 * ring's axis (north there). The Earth's centre is the origin of the "Earth-centred" frame; the
 * ring lies in its XY plane, tilted 37.45 degrees to the equator.
 */

export const VS = `#version 300 es
precision highp float;
const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
out vec2 vUv;
void main(){vec2 p=P[gl_VertexID];vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

const HEAD = `#version 300 es
precision highp float;precision highp int;precision highp sampler3D;
`;

/* ---------------------------------------------------------------- common */
const COMMON = `
#define PI 3.14159265358979
const float RG=6371.0;
const float RT=6471.0;
const vec3 RAY_S=vec3(5.802e-3,13.558e-3,33.1e-3);
const float RAY_H=8.0;
const float MIE_S=7.2e-3;
const float MIE_A=0.8e-3;
const float MIE_H=1.25;
const float MIE_G=0.78;
const vec3 OZO_A=vec3(0.650e-3,1.881e-3,0.085e-3);
const float SUN_R=0.004675;
const vec2 TRANS_SIZE=vec2(256.,64.);
const vec2 MS_SIZE=vec2(32.,32.);
const vec2 IRR_SIZE=vec2(32.,32.);

float sat(float x){return clamp(x,0.,1.);}
vec3 sat3(vec3 x){return clamp(x,0.,1.);}
float remap(float x,float a,float b,float c,float d){return c+(x-a)/(b-a)*(d-c);}
float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float hash13(vec3 p3){p3=fract(p3*.1031);p3+=dot(p3,p3.zyx+31.32);return fract((p3.x+p3.y)*p3.z);}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}

/* Haze: marine air, a little hazier than the textbook clean atmosphere. */
float mieDensity(float h){return exp(-h/MIE_H)+1.4*exp(-max(h,0.)/0.42);}
float ozoneDensity(float h){return max(0.,1.-abs(h-25.)/15.);}
vec3 extinctionAt(float h){
  return RAY_S*exp(-h/RAY_H)+vec3((MIE_S+MIE_A)*mieDensity(h))+OZO_A*ozoneDensity(h);
}
float distToTop(float r,float mu){float d=r*r*(mu*mu-1.)+RT*RT;return max(0.,-r*mu+sqrt(max(d,0.)));}
float distToGround(float r,float mu){float d=r*r*(mu*mu-1.)+RG*RG;return d<0.?-1.:(-r*mu-sqrt(d));}
vec2 transUV(float r,float mu){
  float H=sqrt(RT*RT-RG*RG);float rho=sqrt(max(0.,r*r-RG*RG));
  float d=distToTop(r,mu);float dmin=RT-r,dmax=rho+H;
  vec2 uv=vec2((d-dmin)/max(dmax-dmin,1e-4),rho/H);
  return .5/TRANS_SIZE+uv*(1.-1./TRANS_SIZE);
}
float rayleighPhase(float c){return 3./(16.*PI)*(1.+c*c);}
float miePhase(float c,float g){float g2=g*g;return 3./(8.*PI)*((1.-g2)*(1.+c*c))/((2.+g2)*pow(max(1.+g2-2.*g*c,1e-4),1.5));}
float hg(float c,float g){float g2=g*g;return (1.-g2)/(4.*PI*pow(max(1.+g2-2.*g*c,1e-4),1.5));}
`;

/* Functions that read the precomputed tables. */
const LUTS = `
uniform sampler2D uTrans;uniform sampler2D uMS;uniform sampler2D uIrr;
vec3 transLUT(float r,float mu){return texture(uTrans,transUV(min(r,RT),mu)).rgb;}
/* transmittance from radius r towards direction mu, all the way to space (ignores the ground) */
vec3 transToSpace(float r,float mu){
  if(r>RT){
    float b=r*mu;float disc=b*b-r*r+RT*RT;
    if(disc<0.||mu>0.)return vec3(1.);
    float t=-b-sqrt(disc);
    float mu2=clamp((r*mu+t)/RT,-1.,1.);
    return transLUT(RT,mu2);
  }
  return transLUT(r,mu);
}
/* the Sun's visible fraction above the Earth's limb, seen from radius r */
float sunVis(float r,float mu){
  float s=RG/r;float muH=-sqrt(max(0.,1.-s*s));
  float d=(mu-muH)/max(sqrt(max(1.-muH*muH,0.)),1e-3);
  return smoothstep(-SUN_R,SUN_R,d);
}
vec2 msUV(float r,float mus){
  vec2 uv=vec2(mus*.5+.5,clamp((r-RG)/(RT-RG),0.,1.));
  return .5/MS_SIZE+uv*(1.-1./MS_SIZE);
}
vec3 msLUT(float r,float mus){return texture(uMS,msUV(r,mus)).rgb;}
/* sky irradiance on an up-facing (x<.5) or down-facing (x>.5) surface */
vec3 irrUp(float h,float mus){vec2 uv=vec2(mus*.5+.5,clamp(h/100.,0.,1.));uv=.5/IRR_SIZE+uv*(1.-1./IRR_SIZE);return texture(uIrr,vec2(uv.x*.5,uv.y)).rgb;}
vec3 irrDown(float h,float mus){vec2 uv=vec2(mus*.5+.5,clamp(h/100.,0.,1.));uv=.5/IRR_SIZE+uv*(1.-1./IRR_SIZE);return texture(uIrr,vec2(.5+uv.x*.5,uv.y)).rgb;}
`;

/* ------------------------------------------------------- transmittance LUT */
export const FS_TRANS = HEAD + COMMON + `
out vec4 o;
void main(){
  vec2 uv=(gl_FragCoord.xy-.5)/(TRANS_SIZE-1.);
  float H=sqrt(RT*RT-RG*RG);float rho=H*uv.y;float r=sqrt(rho*rho+RG*RG);
  float dmin=RT-r,dmax=rho+H;float d=dmin+uv.x*(dmax-dmin);
  float mu=d<=0.?1.:clamp((H*H-rho*rho-d*d)/(2.*r*d),-1.,1.);
  float L=distToTop(r,mu);const int N=80;float dt=L/float(N);vec3 tau=vec3(0.);
  for(int i=0;i<N;i++){float t=(float(i)+.5)*dt;float ri=sqrt(r*r+t*t+2.*r*mu*t);tau+=extinctionAt(ri-RG)*dt;}
  o=vec4(exp(-tau),1.);
}`;

/* --------------------------------------------- multiple scattering (Hillaire 2020) */
export const FS_MS = HEAD + COMMON + `
uniform sampler2D uTrans;
vec3 transLUT(float r,float mu){return texture(uTrans,transUV(min(r,RT),mu)).rgb;}
out vec4 o;
void main(){
  vec2 uv=(gl_FragCoord.xy-.5)/(MS_SIZE-1.);
  float mus=uv.x*2.-1.;float r=RG+max(uv.y*(RT-RG),0.01);
  vec3 sunD=vec3(sqrt(max(0.,1.-mus*mus)),mus,0.);
  vec3 p0=vec3(0.,r,0.);
  vec3 Lsum=vec3(0.),Fsum=vec3(0.);
  const int SQ=8;
  for(int i=0;i<SQ;i++)for(int j=0;j<SQ;j++){
    float th=2.*PI*(float(i)+.5)/float(SQ);
    float ph=acos(1.-2.*(float(j)+.5)/float(SQ));
    vec3 d=vec3(cos(th)*sin(ph),cos(ph),sin(th)*sin(ph));
    float mu=d.y;
    float tG=distToGround(r,mu);float tT=distToTop(r,mu);
    float L=tG>0.?tG:tT;
    const int N=24;float dt=L/float(N);
    vec3 T=vec3(1.),Ls=vec3(0.),Fs=vec3(0.);
    for(int k=0;k<N;k++){
      float t=(float(k)+.5)*dt;vec3 p=p0+d*t;float ri=length(p);float h=ri-RG;
      vec3 sc=RAY_S*exp(-h/RAY_H)+vec3(MIE_S*mieDensity(h));
      vec3 ex=extinctionAt(h);
      float m=dot(p,sunD)/ri;
      float s=RG/ri;float muH=-sqrt(max(0.,1.-s*s));
      vec3 sunT=m>muH?transLUT(ri,m):vec3(0.);
      vec3 st=exp(-ex*dt);
      vec3 S=sc*sunT/(4.*PI);
      Ls+=T*(S-S*st)/max(ex,vec3(1e-7));
      Fs+=T*(sc-sc*st)/max(ex,vec3(1e-7));
      T*=st;
    }
    if(tG>0.){vec3 pg=p0+d*tG;float m=dot(normalize(pg),sunD);vec3 sunT=m>0.?transLUT(RG,m):vec3(0.);Ls+=T*sunT*max(m,0.)*0.18/PI;}
    Lsum+=Ls;Fsum+=Fs;
  }
  float inv=1./float(SQ*SQ);
  vec3 L2=Lsum*inv,fms=Fsum*inv;
  vec3 psi=L2/(1.-min(fms,vec3(.99)));
  o=vec4(psi,1.);
}`;

/* ------------------------------------------ sky irradiance (up- and down-facing) */
export const FS_IRR = HEAD + COMMON + LUTS + `
out vec4 o;
vec3 skyRad(vec3 p0,vec3 d,vec3 sunD){
  float r=length(p0);float mu=dot(p0,d)/r;
  float tG=distToGround(r,mu);float tT=distToTop(r,mu);float L=tG>0.?tG:tT;
  const int N=14;float dt=L/float(N);vec3 T=vec3(1.),Ls=vec3(0.);
  float c=dot(d,sunD);float pR=rayleighPhase(c),pM=miePhase(c,MIE_G);
  for(int k=0;k<N;k++){float t=(float(k)+.5)*dt;vec3 p=p0+d*t;float ri=length(p);float h=ri-RG;
    float dR=exp(-h/RAY_H),dM=mieDensity(h);vec3 ex=extinctionAt(h);
    float m=dot(p,sunD)/ri;vec3 sunT=transToSpace(ri,m)*sunVis(ri,m);vec3 ms=msLUT(ri,m);
    vec3 S=RAY_S*dR*(pR*sunT+ms)+MIE_S*dM*(pM*sunT+ms);vec3 st=exp(-ex*dt);
    Ls+=T*(S-S*st)/max(ex,vec3(1e-7));T*=st;}
  if(tG>0.){vec3 pg=p0+d*tG;vec3 n=normalize(pg);float m=dot(n,sunD);
    /* the ground seen from above: ocean and cloud tops, average albedo .22 */
    Ls+=T*(transLUT(RG,m)*sunVis(RG+.001,m)*max(m,0.)+msLUT(RG,m)*.6)*0.22/PI;}
  return Ls;
}
void main(){
  vec2 fc=gl_FragCoord.xy-.5;bool down=fc.x>=IRR_SIZE.x;
  vec2 uv=vec2(mod(fc.x,IRR_SIZE.x),fc.y)/(IRR_SIZE-1.);
  float mus=uv.x*2.-1.;float h=uv.y*100.;float r=RG+max(h,.005);
  vec3 sunD=vec3(sqrt(max(0.,1.-mus*mus)),mus,0.);vec3 p0=vec3(0.,r,0.);
  vec3 E=vec3(0.);
  const int A=8,B=4;
  for(int i=0;i<A;i++)for(int j=0;j<B;j++){
    float th=2.*PI*(float(i)+.5)/float(A);float u=(float(j)+.5)/float(B);
    float ct=sqrt(1.-u);float st=sqrt(u); /* cosine-weighted */
    vec3 d=vec3(cos(th)*st,ct,sin(th)*st);if(down)d.y=-d.y;
    E+=skyRad(p0,d,sunD);
  }
  E*=PI/float(A*B);
  o=vec4(E,1.);
}`;

/* -------------------------------------------------- environment (low-res sky) */
/* An equirectangular map of the clear sky (plus a dim Earth) seen from one point.
   Used for light falling into the car and for reflections in the sea. */
export const FS_ENV = HEAD + COMMON + LUTS + `
uniform vec3 uPos;uniform vec3 uSun;uniform vec2 uSize;
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy/uSize;
  float az=(uv.x-.5)*2.*PI;float el=(uv.y-.5)*PI;
  vec3 d=vec3(sin(az)*cos(el),sin(el),-cos(az)*cos(el));
  vec3 p0=uPos;float r=length(p0);float mu=dot(p0,d)/r;
  float tG=distToGround(r,mu);
  float t0=0.,t1;
  if(r>RT){float b=r*mu;float disc=b*b-r*r+RT*RT;if(disc<0.){o=vec4(0.,0.,0.,1.);return;}t0=max(0.,-b-sqrt(disc));t1=-b+sqrt(disc);}else t1=distToTop(r,mu);
  if(tG>0.)t1=tG;
  const int N=20;float dt=(t1-t0)/float(N);vec3 T=vec3(1.),Ls=vec3(0.);
  float c=dot(d,uSun);float pR=rayleighPhase(c),pM=miePhase(c,MIE_G);
  for(int k=0;k<N;k++){float t=t0+(float(k)+.5)*dt;vec3 p=p0+d*t;float ri=length(p);float h=ri-RG;
    float dR=exp(-h/RAY_H),dM=mieDensity(h);vec3 ex=extinctionAt(h);
    float m=dot(p,uSun)/ri;vec3 sunT=transToSpace(ri,m)*sunVis(ri,m);vec3 ms=msLUT(ri,m);
    vec3 S=RAY_S*dR*(pR*sunT+ms)+MIE_S*dM*(pM*sunT+ms);vec3 st=exp(-ex*dt);
    Ls+=T*(S-S*st)/max(ex,vec3(1e-7));T*=st;}
  if(tG>0.){vec3 n=normalize(p0+d*tG);float m=dot(n,uSun);
    Ls+=T*(transLUT(RG,m)*sunVis(RG+.001,m)*max(m,0.)+irrUp(0.,m))*0.2/PI;}
  o=vec4(Ls,1.);
}`;

/* --------------------------------------------------------- noise generation */
/* Tileable 3D noise for cloud detail: R Perlin-Worley, G/B/A Worley octaves. */
export const FS_NOISE3D = HEAD + COMMON + `
uniform float uSlice;uniform float uN;
out vec4 o;
vec3 rnd3(vec3 c,float per){c=mod(c,per);return hash33(c+vec3(17.1,3.7,9.2));}
float worley(vec3 p,float per){
  vec3 i=floor(p),f=fract(p);float d=1.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=vec3(x,y,z);vec3 r=g+rnd3(i+g,per)-f;d=min(d,dot(r,r));}
  return 1.-sqrt(d);
}
float grad(vec3 c,float per,vec3 f){vec3 h=rnd3(c,per)*2.-1.;return dot(normalize(h+1e-4),f);}
float perlin(vec3 p,float per){
  vec3 i=floor(p),f=fract(p);vec3 u=f*f*f*(f*(f*6.-15.)+10.);
  float a=grad(i,per,f),b=grad(i+vec3(1,0,0),per,f-vec3(1,0,0)),c=grad(i+vec3(0,1,0),per,f-vec3(0,1,0)),d=grad(i+vec3(1,1,0),per,f-vec3(1,1,0));
  float e=grad(i+vec3(0,0,1),per,f-vec3(0,0,1)),g=grad(i+vec3(1,0,1),per,f-vec3(1,0,1)),h=grad(i+vec3(0,1,1),per,f-vec3(0,1,1)),k=grad(i+vec3(1,1,1),per,f-vec3(1,1,1));
  return mix(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),mix(mix(e,g,u.x),mix(h,k,u.x),u.y),u.z);
}
void main(){
  vec3 p=vec3(gl_FragCoord.xy,uSlice+.5)/uN;
  float pf=0.,amp=1.,tot=0.;
  for(int i=0;i<4;i++){float fr=4.*pow(2.,float(i));pf+=amp*perlin(p*fr,fr);tot+=amp;amp*=.5;}
  pf=pf/tot*.5+.5;
  float w1=worley(p*4.,4.),w2=worley(p*8.,8.),w3=worley(p*16.,16.),w4=worley(p*32.,32.);
  float wf=w1*.625+w2*.25+w3*.125;
  float pw=sat(remap(pf,wf-1.,1.,0.,1.));
  o=vec4(pw,w2*.625+w3*.25+w4*.125,w3*.625+w4*.375,w4);
}`;

/* Tileable 2D weather (one tile = 320 km):
   R cumulus (blobs a few km across, gathered on the walls of open convection cells),
   G storm clusters (rare), B cirrus streaks, A fine variation. */
export const FS_WEATHER = HEAD + COMMON + `
uniform float uN;
out vec4 o;
vec2 rnd2(vec2 c,float per){c=mod(c,per);return hash22(c+vec2(7.3,1.9));}
float vnoise(vec2 p,float per){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  float a=rnd2(i,per).x,b=rnd2(i+vec2(1,0),per).x,c=rnd2(i+vec2(0,1),per).x,d=rnd2(i+vec2(1,1),per).x;
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p,float per,int oct){float s=0.,a=.5,t=0.;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*vnoise(p,per);t+=a;p*=2.;per*=2.;a*=.5;}return s/t;}
float worley2(vec2 p,float per){vec2 i=floor(p),f=fract(p);float d=1.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 g=vec2(x,y);vec2 r=g+rnd2(i+g,per)-f;d=min(d,dot(r,r));}return sqrt(d);}
float worleyId(vec2 p,float per,out vec2 id){vec2 i=floor(p),f=fract(p);float d=1e3;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 g=vec2(x,y);vec2 r=g+rnd2(i+g,per)-f;float dd=dot(r,r);if(dd<d){d=dd;id=mod(i+g,per);}}return sqrt(d);}
void main(){
  vec2 p=gl_FragCoord.xy/uN;
  vec2 q=p+.035*vec2(fbm(p*6.,6.,3),fbm(p*6.+3.1,6.,3))-.0175;
  /* open cells about 40 km across; cumulus gather on the walls */
  float cd=worley2(q*8.,8.);
  float walls=smoothstep(.18,.6,cd);
  /* individual clouds: blobs about 3 km apart, with smaller ones between */
  float w1=worley2(q*96.,96.),w2=worley2(q*192.+.37,192.);
  float fine=fbm(q*64.,64.,4);
  /* streets: rows of cloud along the trade wind (east-west) */
  float streets=fbm(vec2(q.x*4.,q.y*22.)+fine*.6,4.,4);
  float org=sat(walls*.7+streets*.5-.08);
  float cu=sat(org*.85+(fine-.5)*.35);
  /* storm clusters: one or two per tile, each a few towers */
  vec2 sid;float sd=worleyId(p*3.,3.,sid);
  float stormy=step(hash12(sid+vec2(3.7,9.1)),.17);
  float core=smoothstep(.30,.04,sd)*stormy;
  float tw=worley2(q*36.,36.);
  float st=core*smoothstep(.55,.12,tw);
  /* cirrus: long streaks */
  float ci=fbm(vec2(p.x*5.,p.y*24.)+fbm(p*10.,10.,3)*.9,5.,6);
  o=vec4(cu,st,ci,fbm(p*96.,96.,4));
}`;

/* ---------------------------------------------------------------- main pass */
export const FS_MAIN = HEAD + COMMON + LUTS + `
uniform vec2 uRes;uniform float uTime;uniform float uFrame;
uniform vec3 uCamE;uniform float uCamH;uniform mat3 uView;uniform vec2 uTanHalf;
uniform vec3 uSun;uniform mat3 uStarRot;uniform float uPixAng;
uniform int uMode;uniform float uSpeed;uniform float uDock;uniform float uCabinLamp;
uniform vec3 uC;uniform float uRingU0;uniform vec3 uStation;uniform vec3 uPlatform;
uniform vec2 uWind;uniform float uEvolve;uniform float uQual;uniform float uNight;uniform float uFog;uniform int uDbg;
uniform float uLon0;uniform float uLonRel;uniform float uPodAng;uniform sampler2D uBand;
uniform sampler2D uMeter;
uniform int uZero;   /* never set, so always 0: loop bounds Direct3D's compiler can't unroll (keeps the shader small) */
uniform sampler2D uEnv;uniform sampler2D uEnvSea;uniform sampler2D uWeather;
uniform sampler2D uRegion;uniform sampler2D uInset;uniform sampler3D uNoise;
layout(location=0) out vec4 oCol;

const float RING_ALT=300.;
const float RR_M=(RG+RING_ALT)*1000.;
const float TUBE_A=6.0;       /* tube half-size (m) */
const float CABLE_R=0.32;     /* cable radius (m) */

float jit;

/* ---------- small geometry helpers ---------- */
vec2 sphereHitH(float mu,float hs){
  /* intersections of the view ray with the sphere at altitude hs (km), camera at uCamH */
  float rc=RG+uCamH,Rs=RG+hs;float b=rc*mu;float c=(uCamH-hs)*(rc+Rs);float D=b*b-c;
  if(D<0.)return vec2(-1.);float s=sqrt(D);
  float q=-b-sign(b+1e-30)*s;   /* stable */
  float t1=q,t2=c/q;            /* q = A*t (A=1) */
  return vec2(min(t1,t2),max(t1,t2));
}
float boxHit(vec3 ro,vec3 rd,vec3 b,out vec3 n){
  vec3 m=1./rd;vec3 k=abs(m)*b;vec3 t1=-m*ro-k,t2=-m*ro+k;
  float tn=max(max(t1.x,t1.y),t1.z),tf=min(min(t2.x,t2.y),t2.z);
  if(tn>tf||tf<0.)return -1.;
  n=-sign(rd)*step(t1.yzx,t1.xyz)*step(t1.zxy,t1.xyz);
  return tn>0.?tn:-1.;
}
float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdRoundBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float sdCapX(vec3 p,float hl,float r){p.x-=clamp(p.x,-hl,hl);return length(p)-r;}
float sdCylY(vec3 p,float r,float hh){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,hh);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float sdRoundRect(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}

/* ---------- lighting at an altitude ---------- */
vec3 sunLight(float hKm,vec3 nrmUp){
  float r=RG+hKm;float m=dot(nrmUp,uSun);return transToSpace(r,m)*sunVis(r,m);
}

/* ---------- atmosphere integration ---------- */
void atmos(vec3 ro,vec3 rd,float t0,float t1,int n,inout vec3 L,inout vec3 T){
  if(t1<=t0||n<1)return;
  float c=dot(rd,uSun);float pR=rayleighPhase(c),pM=miePhase(c,MIE_G);
  float span=t1-t0;bool inside=length(ro)<RT;
  for(int i=0;i<48;i++){
    if(i>=n)break;
    float u0=float(i)/float(n),u1=float(i+1)/float(n);
    float a,b;
    if(inside){a=t0+span*u0*u0;b=t0+span*u1*u1;}else{a=t0+span*u0;b=t0+span*u1;}
    float t=mix(a,b,jit);float dt=b-a;
    vec3 p=ro+rd*t;float r=length(p);float h=r-RG;
    if(h>110.)continue;
    h=max(h,0.);
    float dR=exp(-h/RAY_H),dM=mieDensity(h);
    vec3 ex=RAY_S*dR+vec3((MIE_S+MIE_A)*dM)+OZO_A*ozoneDensity(h);
    float m=dot(p,uSun)/r;
    vec3 sunT=transToSpace(r,m)*sunVis(r,m);
    vec3 ms=msLUT(r,m);
    vec3 S=RAY_S*dR*(pR*sunT+ms)+MIE_S*dM*(pM*sunT+ms);
    vec3 st=exp(-ex*dt);
    L+=T*(S-S*st)/max(ex,vec3(1e-8));
    /* airglow: oxygen glowing faintly around 95 km, the green line above the night limb */
    L+=T*vec3(.35,1.,.25)*exp(-pow((h-95.)/3.5,2.))*dt*1.6e-9*uNight;
    T*=st;
  }
}
/* atmosphere between two distances along the view ray, clipped to the shell */
void atmosSeg(vec3 rd,float muUp,float t0,float t1,int n,inout vec3 L,inout vec3 T){
  vec2 ta=sphereHitH(muUp,110.);
  if(ta.y<0.)return;
  float a=max(t0,max(ta.x,0.)),b=min(t1,ta.y);
  if(uCamH<110.){a=max(t0,0.);b=min(t1,ta.y);}
  atmos(uCamE,rd,a,b,n,L,T);
}

/* ---------- Earth surface ---------- */
/* Ring coordinates: x along the ring, east from the first platform; y north of the ring.
   The frame is anchored at the current station, uLon0 degrees along the ring. The maps are
   baked in these coordinates (see _design/orbital-ring/bake_geography.py). */
vec2 lonlat(vec3 n){float lo=uLon0+degrees(atan(n.x,n.y));lo=mod(lo+180.,360.)-180.;return vec2(lo,degrees(asin(clamp(n.z,-1.,1.))));}
vec4 geo(vec3 n,float footKm){
  vec2 ll=lonlat(n);
  vec4 g=vec4(0.);
  /* the ring's whole track (10 km pixels), then finer maps round the first platform */
  vec2 bu=vec2((ll.x+180.)/360.,(26.37-ll.y)/52.74);
  if(bu.y>0.&&bu.y<1.)g=texture(uBand,bu);
  vec2 ru=vec2((ll.x+18.5)/37.,(18.5-ll.y)/37.);
  if(ru.x>0.&&ru.x<1.&&ru.y>0.&&ru.y<1.){float wr=smoothstep(0.,.03,min(min(ru.x,1.-ru.x),min(ru.y,1.-ru.y)));g=mix(g,texture(uRegion,ru),wr);}
  vec2 iu=vec2((ll.x+1.)/2.,(1.-ll.y)/2.);
  if(iu.x>0.&&iu.x<1.&&iu.y>0.&&iu.y<1.&&footKm<6.){
    vec4 gi=texture(uInset,iu);float w=smoothstep(.0,.08,min(min(iu.x,1.-iu.x),min(iu.y,1.-iu.y)));
    g=mix(g,gi,w);
  }
  return g;
}
struct Wx{float cov,storm,anvil,top;};
float gEarthCS=1.;
Wx weatherAt(vec2 xz,float lod);
vec2 cxz(vec3 p);
float waveH(vec2 p,float t){
  return sin(dot(p,vec2(.12,.05))+t*.9)*.5+sin(dot(p,vec2(-.07,.16))+t*1.1)*.35+sin(dot(p,vec2(.31,-.21))+t*1.7)*.15;
}
vec3 shadeEarth(vec3 rd,float t,vec3 pE){
  vec3 n=normalize(pE);
  float foot=uPixAng*t;           /* km per pixel at this distance */
  vec4 g=geo(n,foot);
  float land=g.r,dry=g.g,shal=g.b,lights=g.a;
  
  float m=dot(n,uSun);
  vec3 sunT=transToSpace(RG+.002,m)*sunVis(RG+.002,m);
  vec3 Esky=irrUp(0.,m);
  float cs=gEarthCS;   /* the decks' shadow here, sampled with the decks (see cloudDecks) */
  vec3 V=-rd;
  vec2 ll=lonlat(n);
  vec2 mxz=vec2(ll.x*111.32,ll.y*110.6);  /* km map coords */
  /* sea */
  float slick=texture(uWeather,mxz/173.+.31).a;
  float rough=mix(.09,.26,smoothstep(.25,.8,slick))+min(foot*.002,.08);
  vec3 N=n;
  float hd=t*1000.;  /* metres */
  if(hd<6000.){
    /* resolved waves near the platform */
    vec3 east=normalize(cross(n,vec3(0,0,1))),north=cross(east,n);
    vec2 pm=vec2(dot(pE*1000.-uCamE*1000.,east),dot(pE*1000.-uCamE*1000.,north));
    float e=.6;float tt=uTime;
    vec2 gr=vec2(waveH(pm+vec2(e,0),tt)-waveH(pm-vec2(e,0),tt),waveH(pm+vec2(0,e),tt)-waveH(pm-vec2(0,e),tt))/(2.*e);
    float fade=1.-smoothstep(300.,6000.,hd);
    N=normalize(n-(east*gr.x+north*gr.y)*.35*fade);
    rough=mix(rough,.05,fade*.5);
  }
  float NV=max(dot(N,V),1e-3);
  float F=.02+.98*pow(1.-NV,5.);
  vec3 R=reflect(rd,N);if(dot(R,n)<0.)R=reflect(R,n);
  float az=atan(R.x,-R.z);float el=asin(clamp(dot(R,vec3(0,1,0)),-1.,1.));
  vec3 sky=texture(uEnvSea,vec2(az/(2.*PI)+.5,el/PI+.5)).rgb;
  /* clouds overhead hide part of the sky the sea would reflect */
  if(t<120.){Wx wl=weatherAt(cxz(pE),3.);sky*=1.-.6*sat(wl.cov*1.6+wl.anvil*2.);}
  vec3 Hh=normalize(V+uSun);float NH=max(dot(N,Hh),0.);float a2=rough*rough;
  float dGGX=a2/(PI*pow(NH*NH*(a2-1.)+1.,2.));
  float NL=max(dot(N,uSun),0.);
  float Gv=NV/(NV*(1.-a2*.5)+a2*.5),Gl=NL/(NL*(1.-a2*.5)+a2*.5);
  vec3 glint=sunT*cs*dGGX*Gv*Gl/(4.*NV)*F;
  vec3 deep=vec3(.006,.022,.05);
  vec3 lag=vec3(.03,.16,.18);
  vec3 body=mix(deep,lag,sat(shal*1.2));
  vec3 sea=body*(sunT*cs*max(m,0.)+Esky)/PI*(1.-F)+sky*F+glint;
  /* land */
  float veg=texture(uWeather,mxz/60.+.7).a;
  vec3 alb=mix(vec3(.035,.06,.025),vec3(.07,.075,.035),veg);
  alb=mix(alb,vec3(.13,.11,.07),sat(dry*1.4)*.85);             /* dry grass and scrub (summer-gold hills) */
  alb=mix(alb,vec3(.24,.20,.14),smoothstep(.7,1.,dry)*.8);     /* desert */
  vec3 lnd=alb*(sunT*cs*max(m,0.)+Esky)/PI;
  /* night lights where the towns are (from populated places), broken up a little */
  float city=lights*lights*(.55+.9*pow(texture(uWeather,mxz/40.).a,2.))*land*(1.-smoothstep(-.05,.02,m))*uNight;
  lnd+=vec3(1.,.55,.2)*city*6e-6;
  return mix(sea,lnd,land);
}

/* ---------- clouds ----------
   Shapes come from billowy 3D noise (Perlin-Worley) thresholded by a coverage map, as
   in modern sky renderers. Near clouds are marched as a volume; far clouds, and every
   cloud once you are high up, are drawn as a shaded deck. */
const float CB=0.7,CT=13.5,DECK=1.75,ANVIL=11.9;
float VOL_MAX=140.;
/* weather coordinates: arc lengths (km) along the ring from the first platform, and across it */
vec2 cxz(vec3 p){float r=length(p);return vec2(RG*(uLonRel+atan(p.x,p.y)),RG*asin(clamp(p.z/r,-1.,1.)));}
float gGraze=1.;
float wxLod(float dist){return clamp(log2(uPixAng*dist*gGraze*1.6+1.),0.,6.);}
float nzLod(float dist,float period){return clamp(log2(max(uPixAng*dist*gGraze*64./period,1.)),0.,6.);}
Wx weatherAt(vec2 xz,float lod){
  Wx w;vec2 u=(xz+uWind)/320.;vec4 a=textureLod(uWeather,u,lod);
  float big=textureLod(uWeather,(xz+uWind*.5)/2600.+vec2(.37,.11),3.).a;
  float thr=.36-.12*smoothstep(.38,.62,big);
  w.cov=.62*sat((a.r-thr)/(1.-thr));
  w.top=CB+.9+2.3*sat(w.cov*1.7)*(.55+.9*a.a);
  w.storm=a.g;
  w.anvil=textureLod(uWeather,u,lod+2.8).g;
  return w;
}
float cumulusTop(float cov){return CB+.4+2.5*pow(cov,1.3);}
float stormTop(float st){return CB+12.4*pow(st,.55);}
/* rotate and warp the noise domain so its 5.5 km tiling never lines up into rows */
vec3 nzCoord(vec2 xz,float h){
  vec2 p=xz+uWind;
  vec2 wv=textureLod(uWeather,p/97.+vec2(.13,.71),2.).ba-.5;
  p=mat2(.8253,-.5646,.5646,.8253)*p+wv*vec2(11.,9.);
  return vec3(p.x,h*1.15,p.y)/5.5+vec3(0.,uEvolve*.00025,0.);
}
/* the raw Perlin-Worley shape is narrow (5%..99.5% = .715...863 at full res, narrower in
   the mips), so normalise it and restore its spread at coarser levels */
float gLod=0.;
float baseShape(vec4 n){
  float lf=n.g*.625+n.b*.25+n.a*.125;float raw=(n.r+1.-lf)/(2.-lf);
  float L=clamp(gLod,0.,5.);
  float k=L<1.?mix(1.,1.07,L):L<2.?mix(1.07,1.17,L-1.):L<3.?mix(1.17,1.48,L-2.):L<4.?mix(1.48,3.3,L-3.):mix(3.3,6.,L-4.);
  float c=L<3.?.785:mix(.78,.781,L-3.);
  return sat(.5+(raw-c)*k/.17);
}
/* Explicit cumulus: a jittered 3.2 km grid, each cell holding at most one dome with a flat
   base at the condensation level and a rounded top, some with a turret. The weather map
   decides how many cells are filled. Returns the signed distance (km) to the nearest dome. */
const float CELL=3.2;
float cumulusSD(vec2 xz,float h,float cov,out float hf,out vec3 dome){
  hf=0.;dome=vec3(0.,0.,1.);
  vec2 pw=xz+uWind;vec2 gi=floor(pw/CELL);
  float best=1e3;float yb=h-CB;
  for(int j=-1;j<=1+uZero;j++)for(int i=-1;i<=1+uZero;i++){
    vec2 c=gi+vec2(i,j);
    vec3 r=hash33(vec3(c,11.3));
    if(r.z>cov*1.7)continue;
    float sz=fract(r.z*17.31+r.x*3.1);
    float W=mix(.4,1.25,sz)*mix(.85,1.15,cov);
    float H=W*mix(.85,1.9,fract(r.y*9.7))*mix(.8,1.15,cov);
    vec2 cc=(c+.22+.56*r.xy)*CELL;
    vec2 dv=(pw-cc)/W;
    if(dot(dv,dv)>5.)continue;
    /* elliptical footprint, turned at random */
    float an=r.x*6.2832,asp=mix(1.,1.7,fract(r.z*5.3));
    mat2 rot=mat2(cos(an),sin(an),-sin(an),cos(an));
    vec2 de=rot*dv;de.x/=asp;
    float e=length(vec3(de.x,max(yb,0.)/H,de.y));
    float sd=(e-1.)*min(W,H);
    float hh=H;
    /* one or two smaller domes beside it make a cluster */
    vec3 r2=hash33(vec3(c,23.7));
    for(int k=0;k<2+uZero;k++){
      if(r2[k]>.35+cov)continue;
      vec2 off=(vec2(fract(r2.z*7.1+float(k)*.37),fract(r2.y*3.7+float(k)*.61))-.5)*1.9*W;
      float w2=W*mix(.45,.8,r2[k]),h2=H*mix(.55,1.1,fract(r2[k]*11.));
      vec2 d2=(pw-cc-off)/w2;
      float e2=length(vec3(d2.x,max(yb,0.)/h2,d2.y));
      sd=min(sd,(e2-1.)*min(w2,h2));
    }
    if(r.x>.55){
      vec2 d3=(pw-cc-vec2(.25,-.15)*W)/(W*.55);
      float e3=length(vec3(d3.x,max(yb-H*.45,0.)/(H*.8),d3.y));
      sd=min(sd,(e3-1.)*W*.55);hh=H*1.25;
    }
    sd=max(sd,-yb);
    if(sd<best){best=sd;hf=yb/hh;dome=vec3(dv,H/W);}
  }
  return best;
}
float gSkip;   /* how far (km) the march may jump from here without missing a cloud */
float cloudDensity(vec3 p,float h,float dist,float detail,out float hf){
  vec2 xz=cxz(p);
  Wx w=weatherAt(xz,wxLod(dist));
  hf=0.;gSkip=0.;
  if(w.cov<=0.&&w.storm<=.02&&w.anvil<=.06){gSkip=.5;return 0.;}
  vec3 q=nzCoord(xz,h);
  gLod=nzLod(dist,5.5);
  float d=0.;
  if(w.cov>0.&&h<5.){
    float hf2;vec3 dm;
    float sd=cumulusSD(xz,h,w.cov,hf2,dm);
    if(w.storm<=.02)gSkip=clamp(sd*.6-.35,0.,1.1);   /* the grid only knows its neighbours: never jump past a cell */
    if(sd<.6){
      /* cauliflower: push the surface in and out with billowy noise, less with distance */
      float near=1.-smoothstep(40.,140.,dist);
      /* big lobes (about 700 m) and a little finer billowing; none at the flat base */
      vec4 n1=textureLod(uNoise,q*2.4+vec3(.61,.27,.13),nzLod(dist,5.5/2.4));
      vec4 n2=textureLod(uNoise,q*7.+vec3(.31,.17,.73),nzLod(dist,5.5/7.));
      float lobes=n1.r*.55+n1.g*.45-.5;
      float fine=(n2.r-.5)*(1.-smoothstep(6.,30.,dist));
      float disp=(lobes*.6+fine*.05)*mix(.6,1.,near)*smoothstep(0.,.18,hf2);
      sd=max(sd,-(h-CB-(n1.b-.5)*.07));       /* a base that is flat, but not ruled */
      float edge=max(.08,uPixAng*dist*1.8);
      float b=sat((-sd+disp)/edge);
      if(b>d){d=b;hf=hf2;}
    }
  }
  if(w.storm>.02&&(uDbg&4096)==0){
    float base=baseShape(textureLod(uNoise,q,gLod));
    float top=stormTop(w.storm);float f=(h-CB)/(top-CB);
    float hg=smoothstep(0.,.03,f)*(1.-smoothstep(.72,1.,f));
    float c=sat(w.storm*1.5);
    float ch=max(c*hg,1e-3);
    float b=sat((base-1.+ch)/ch)*hg;
    if(b>d){d=b;hf=f;}
    float an=smoothstep(.05,.2,w.anvil)*smoothstep(ANVIL-.9,ANVIL-.2,h)*(1.-smoothstep(ANVIL+.4,ANVIL+1.3,h));
    if(an>0.&&(uDbg&2048)==0){float ca=max(an*.8,1e-3);float b2=sat((base-1.+ca)/ca)*an*.8;if(b2>d){d=b2;hf=.97;}}
  }
  return max(d,0.);
}
/* light at a cloud sample, given the optical depth od towards the Sun (three density samples
   at .12, .45 and 1.3 km, weighted .15, .4 and 1.2, times 48; taken by the march below) */
vec3 cloudLight(vec3 p,float h,float hf,float dens,float cosT,float od){
  vec3 up=p/length(p);float m=dot(up,uSun);
  vec3 sunT=transToSpace(RG+h,m)*sunVis(RG+h,m);
  /* single scattering (sharp, forward-peaked) plus a broad multiple-scattering term that
     keeps thick clouds white from every side */
  float ph=mix(hg(cosT,.78),hg(cosT,-.2),.28);
  float powder=1.-exp(-dens*5.);
  vec3 L=sunT*(ph*exp(-od)*.9+.26*exp(-od*.17)*mix(.45,1.,powder)+.04*exp(-od*.05));
  vec3 amb=irrUp(h,m)*mix(.3,1.,sat(hf))+irrDown(h,m)*mix(.45,.1,sat(hf));
  return L+amb*.28;
}
/* the deck: a thin shaded layer standing in for far or small clouds */
vec4 deckSample(vec3 p,float dist,float which,out float hTop){
  vec2 xz=cxz(p);
  float lw=wxLod(dist);
  Wx w=weatherAt(xz,lw);
  float lod=nzLod(dist,5.5);gLod=lod;
  float a=0.;hTop=DECK;
  vec3 nrm;
  if(which<.5){
    /* the same domes, seen from far away or from above */
    float hf2;vec3 dm;
    float sd=cumulusSD(xz,CB+.25,w.cov,hf2,dm);
    float edge=max(.07,uPixAng*dist*gGraze*1.4);
    float lob=textureLod(uNoise,nzCoord(xz,CB+.6)*2.4+vec3(.61,.27,.13),lod).r-.5;
    float bDome=w.cov>0.?sat((-sd+lob*.5)/edge):0.;
    /* seen from high up, a cumulus field reads best as thresholded noise (open cells) */
    float base0=baseShape(textureLod(uNoise,nzCoord(xz,CB+.6),lod));
    float cq=max(w.cov*.9,1e-3);
    float bNoise=1.-exp(-sat((base0-1.+cq)/cq)*.8*14.);
    float kHigh=smoothstep(8.,30.,uCamH);
    float b=mix(bDome,bNoise,kHigh);
    float st=sat(w.storm*1.4);
    vec2 cell=floor((xz+uWind)/9.);float fl=hash12(cell+floor(uTime*.7));
    float flash=step(.985,fl)*step(.15,st)*(.6+.4*sin(uTime*40.+fl*30.));
    float base=baseShape(textureLod(uNoise,nzCoord(xz,CB+1.),lod));
    float sq=max(st,1e-3);
    float bs=sat((base-1.+sq)/sq)*step(.001,st);
    a=max(b,1.-exp(-bs*14.));
    hTop=bs>b?stormTop(w.storm):CB+dm.z*1.;
    vec3 up=normalize(p);vec3 ex=normalize(cross(up,vec3(0,0,1))),nz=cross(ex,up);
    /* dome normal: steeper towards the edge of each cloud */
    float rr=min(dot(dm.xy,dm.xy),.95);
    vec2 g=dm.xy*dm.z/sqrt(1.-rr)*.55;
    nrm=bs>b?up:normalize(up+(ex*g.x+nz*g.y)*(1.-kHigh));
    float sm=dot(up,uSun);
    vec3 sunT=transToSpace(RG+hTop,sm)*sunVis(RG+hTop,sm);
    float lam=max(dot(nrm,uSun),0.)*.8+.2*sat(sm*4.);
    vec3 col=sunT*lam*.95+irrUp(hTop,sm)*.5;
    col+=vec3(.75,.8,1.)*flash*bs*.004*uNight*PI;
    return vec4(col/PI*.85,a);
  }else{
    float an=smoothstep(.05,.2,w.anvil);
    float base=baseShape(textureLod(uNoise,nzCoord(xz,ANVIL),lod));
    float aq=max(an*.8,1e-3);
    float b=sat((base-1.+aq)/aq)*an;
    a=1.-exp(-b*8.);
    hTop=ANVIL+.8;
    vec3 up=normalize(p);float sm=dot(up,uSun);
    vec3 sunT=transToSpace(RG+hTop,sm)*sunVis(RG+hTop,sm);
    vec3 col=sunT*(.35+.65*sat(sm*3.))+irrUp(hTop,sm)*.5;
    return vec4(col/PI*.85,a);
  }
}
/* march near clouds as a volume; returns premultiplied colour and transmittance */
vec4 cloudVolume(vec3 rd,float muUp,float tMax,out float tMean){
  tMean=-1.;
  if(uCamH>40.)return vec4(0.,0.,0.,1.);
  /* storms are kept far from the platform, so near clouds live in the cumulus layer */
  const float VT=4.4;
  vec2 tTop=sphereHitH(muUp,VT),tBot=sphereHitH(muUp,CB);
  float a,b;
  if(uCamH>VT){if(tTop.x<0.)return vec4(0.,0.,0.,1.);a=tTop.x;b=tBot.x>0.?tBot.x:tTop.y;}
  else if(uCamH>CB){a=0.;b=tBot.x>0.?tBot.x:tTop.y;}
  else{if(tBot.y<0.)return vec4(0.,0.,0.,1.);a=tBot.y;b=tTop.y;}
  b=min(min(b,tMax),VOL_MAX);
  if(b<=a)return vec4(0.,0.,0.,1.);
  /* steps grow with distance; empty air is crossed in jumps using the distance to the
     nearest cloud; entering a cloud bisects back to its edge */
  int N=int(mix(56.,150.,uQual));
  float cosT=dot(rd,uSun);
  vec3 col=vec3(0.);float T=1.,ws=0.,ts=0.;
  float t=a;bool inCloud=false;
  float slope=max(abs(muUp),.02);
  /* One loop, one density call site (Direct3D inlines every call, so this keeps the shader
     small). stage -1: marching; 0..3: bisecting back to a cloud's edge; 4: the sample just
     inside it; 5..7: the three samples towards the Sun that light the current sample. */
  int stage=-1,steps=0;float lo=0.,hi=0.,dEnter=0.,tsE=0.,dtE=0.;
  vec3 pS=vec3(0.);float hS=0.,hfS=0.,dS=0.,tsS=0.,dtS=0.,mS=0.,od=0.;
  for(int i=0;i<1400+uZero;i++){
    if(stage<0&&(steps>=N||t>=b))break;
    float dt=0.,ts0,det=0.;vec3 p;float h;
    if(stage<0){
      steps++;
      dt=min(.03+t*.011,b-t);
      ts0=t+dt*jit;
      p=uCamE+rd*ts0;h=length(p)-RG;
      if(h<CB||h>VT){inCloud=false;t+=dt;continue;}
      det=1.-smoothstep(25.,90.,ts0);
    }else if(stage<5){
      dt=dtE;
      ts0=stage<4?.5*(lo+hi):hi+(tsE-hi)*.5;
      p=uCamE+rd*ts0;h=length(p)-RG;
      det=stage<4?0.:1.-smoothstep(25.,90.,ts0);
    }else{
      float o=stage==5?.12:stage==6?.45:1.3;
      ts0=tsS;p=pS+uSun*o;h=hS+mS*o;
    }
    float hf;
    float d=cloudDensity(p,h,ts0,det,hf);
    if(stage>=5){
      od+=d*(stage==5?.15:stage==6?.4:1.2);
      stage++;
      if(stage<8)continue;
      stage=-1;
    }else{
      if(stage>=0&&stage<4){if(d>.002)hi=ts0;else lo=ts0;stage++;continue;}
      if(stage==4){stage=-1;d=max(d,dEnter);}
      else{
        if(d<=.002){inCloud=false;t+=max(dt,gSkip*.85);continue;}
        if(!inCloud&&dt>.12){lo=t;hi=ts0;tsE=ts0;dtE=dt;dEnter=d;stage=0;continue;}
      }
      inCloud=true;
      /* this sample is in a cloud: light it (if the Sun reaches this height at all) */
      pS=p;hS=h;hfS=hf;dS=d;tsS=ts0;dtS=dt;
      vec3 upS=p/length(p);mS=dot(upS,uSun);od=0.;
      if(dot(transToSpace(RG+h,mS)*sunVis(RG+h,mS),vec3(1.))>1e-6){stage=5;continue;}
    }
    /* accumulate the lit sample */
    float sig=dS*66.;
    vec3 Lc=cloudLight(pS,hS,hfS,dS,cosT,od*48.);
    float st=exp(-sig*dtS);
    float w=T*(1.-st);
    col+=w*Lc;ws+=w;ts+=w*tsS;T*=st;
    t+=dtS;
    if(T<.01)break;
  }
  /* fade the volume out where the deck takes over */
  if(ws>0.)tMean=ts/ws;
  return vec4(col,T);
}
/* far clouds as decks: the low deck and the anvil layer, in depth order */
/* nSh: where the view meets the sea (or zero). Its cloud shadow (cloudShadow) is the same deck
   sample, so it is taken in this loop as a third pass: one inlined copy of deckSample. */
vec4 cloudDecks(vec3 rd,float muUp,float tMax,float tFrom,out float tFirst,vec3 nSh,bool decks){
  tFirst=-1.;gEarthCS=1.;
  vec4 acc=vec4(0.,0.,0.,1.);
  vec2 td=sphereHitH(muUp,DECK),ta=sphereHitH(muUp,ANVIL);
  float t1=uCamH>DECK?td.x:td.y,t2=uCamH>ANVIL?ta.x:ta.y;
  float tt[2];tt[0]=t1;tt[1]=t2;float ww[2];ww[0]=0.;ww[1]=1.;
  if(t2>0.&&(t1<0.||t2<t1)){tt[0]=t2;tt[1]=t1;ww[0]=1.;ww[1]=0.;}
  for(int i=0;i<3+uZero;i++){
    vec3 p;float dist,which;
    if(i<2){
      if(!decks)continue;
      float t=tt[i];
      if(t<=0.||t>tMax||t<tFrom)continue;
      if(ww[i]>.5&&uCamH<40.)continue;   /* far anvils only make sense seen from above */
      p=uCamE+rd*t;dist=t;which=ww[i];
      gGraze=pow(1./max(abs(dot(rd,normalize(p))),.05),.8);
    }else{
      float sm=dot(nSh,uSun);
      if(dot(nSh,nSh)<.5||sm<-.02)break;
      p=nSh*(RG+DECK)+uSun*(DECK/max(sm,.12));dist=40.;which=0.;
      gGraze=6.;
    }
    float ht;
    vec4 c=deckSample(p,dist,which,ht);
    gGraze=1.;
    if(i==2){gEarthCS=mix(1.,.3,c.a);break;}
    float fade=uCamH<40.?smoothstep(VOL_MAX*.75,VOL_MAX,dist):1.;
    c.a*=fade;
    if(c.a>.001){if(tFirst<0.)tFirst=dist;acc.rgb+=acc.a*c.rgb*c.a;acc.a*=1.-c.a;}
  }
  return acc;
}
/* thin cirrus sheet at 12 km */
vec4 cirrus(vec3 rd,float muUp,float tMax){
  vec2 th=sphereHitH(muUp,12.);
  float t=uCamH<12.?th.y:th.x;
  if(t<0.||t>tMax)return vec4(0.,0.,0.,1.);
  vec3 p=uCamE+rd*t;vec2 xz=cxz(p)+uWind*1.7;
  float c=textureLod(uWeather,xz/520.+vec2(.2,.6),clamp(log2(uPixAng*t*1.0+1.),0.,6.)).b;
  float big=textureLod(uWeather,xz/3100.+vec2(.61,.23),3.).b;
  float a=sat((c-.6+.25*(big-.5))*2.4)*.45;
  if(a<.002)return vec4(0.,0.,0.,1.);
  vec3 up=p/length(p);float m=dot(up,uSun);
  vec3 sunT=transToSpace(RG+12.,m)*sunVis(RG+12.,m);
  float cosT=dot(rd,uSun);
  vec3 Lc=sunT*mix(hg(cosT,.6),hg(cosT,-.1),.3)*1.2+irrUp(12.,m)/PI*.6;
  return vec4(Lc*a,1.-a);
}

/* ---------- the ring, seen from far away and up close ---------- */
/* radial offset u(t)=u0+a1 t+a2 t^2 from the ring axis, z(t)=z0+dz t (metres) */
struct RingRay{float u0,a1,a2,z0,dz;};
RingRay ringRay(vec3 rd){
  RingRay r;vec2 Cxy=uC.xy;float rho=length(Cxy);vec2 nOut=-Cxy/rho;
  vec2 dxy=rd.xy;float e=dot(dxy,nOut);
  r.u0=uRingU0;r.a1=e;r.a2=(dot(dxy,dxy)-e*e)/(2.*rho);r.z0=-uC.z;r.dz=rd.z;return r;
}
/* exact forward crossing of the ring's cylinder (u=0) */
float ringCross(vec3 rd){
  vec2 Cxy=uC.xy;float A=dot(rd.xy,rd.xy);if(A<1e-12)return -1.;
  float rho=length(Cxy);float bp=-dot(rd.xy,Cxy);            /* = rho*e */
  float c=uRingU0*(rho+RR_M);
  float D=bp*bp-A*c;if(D<0.)return -1.;float s=sqrt(D);
  float t=bp>0.?(-c)/(bp+s):(-bp+s)/A;
  return t;
}
/* quadratic a2 t^2 + a1 t + a0 = 0 real roots */
vec2 quad(float a,float b,float c){
  if(abs(a)<1e-14){if(abs(b)<1e-14)return vec2(1e30,-1e30);float t=-c/b;return vec2(t,t);}
  float D=b*b-4.*a*c;if(D<0.)return vec2(1e30,-1e30);
  float s=sqrt(D);float q=-.5*(b+sign(b+1e-30)*s);float t1=q/a,t2=c/q;return vec2(min(t1,t2),max(t1,t2));
}
/* octagonal tube: |u|<=A, |z|<=A, |u±z|<=A*1.41*.8 ; returns t, normal in (u,z) */
float tubeHit(RingRay R,float tMax,out vec2 nuz){
  float A=TUBE_A,C=TUBE_A*1.414*.82;
  float lo=0.,hi=tMax;
  /* convex constraints: u<=A, u+z<=C, u-z<=C (each "inside" is one interval since a2>=0) */
  vec2 iv;
  iv=quad(R.a2,R.a1,R.u0-A);lo=max(lo,iv.x);hi=min(hi,iv.y);
  iv=quad(R.a2,R.a1+R.dz,R.u0+R.z0-C);lo=max(lo,iv.x);hi=min(hi,iv.y);
  iv=quad(R.a2,R.a1-R.dz,R.u0-R.z0-C);lo=max(lo,iv.x);hi=min(hi,iv.y);
  /* |z|<=A is linear */
  if(abs(R.dz)>1e-9){float t1=(-A-R.z0)/R.dz,t2=(A-R.z0)/R.dz;lo=max(lo,min(t1,t2));hi=min(hi,max(t1,t2));}
  else if(abs(R.z0)>A)return -1.;
  if(lo>hi)return -1.;
  /* excluded open intervals: u<-A, u+z<-C, u-z<-C (each is "between roots" of the negated form? no: outside) */
  /* u>=-A fails between the roots of a2 t^2+a1 t+(u0+A)=0 */
  vec2 e1=quad(R.a2,R.a1,R.u0+A);
  vec2 e2=quad(R.a2,R.a1+R.dz,R.u0+R.z0+C);
  vec2 e3=quad(R.a2,R.a1-R.dz,R.u0-R.z0+C);
  float t=lo;
  for(int k=0;k<3;k++){
    if(t>e1.x&&t<e1.y)t=e1.y;
    if(t>e2.x&&t<e2.y)t=e2.y;
    if(t>e3.x&&t<e3.y)t=e3.y;
  }
  if(t>hi)return -1.;
  float u=R.u0+R.a1*t+R.a2*t*t,z=R.z0+R.dz*t;
  /* normal: the most active face */
  float f0=u-A,f1=-u-A,f2=z-A,f3=-z-A,f4=(u+z-C)*.7071,f5=(-u-z-C)*.7071,f6=(u-z-C)*.7071,f7=(-u+z-C)*.7071;
  float mx=f0;nuz=vec2(1,0);
  if(f1>mx){mx=f1;nuz=vec2(-1,0);} if(f2>mx){mx=f2;nuz=vec2(0,1);} if(f3>mx){mx=f3;nuz=vec2(0,-1);}
  if(f4>mx){mx=f4;nuz=vec2(.7071,.7071);} if(f5>mx){mx=f5;nuz=vec2(-.7071,-.7071);}
  if(f6>mx){mx=f6;nuz=vec2(.7071,-.7071);} if(f7>mx){mx=f7;nuz=vec2(-.7071,.7071);}
  return t;
}
/* along-ring distance from the station (m) for a point relative to the camera */
float ringS(vec3 P){vec3 d=P-uStation;return d.x;}

/* ---------- the station (signed distance, station frame: x east, y up, z north; origin on the ring axis) ---------- */
float stationSDF(vec3 q,out float mat){
  mat=1.;
  float sag=-q.x*q.x/(2.*RR_M);
  vec3 r=q-vec3(0.,sag,0.);
  /* saddle around the ring tube */
  float sad=sdRoundBox(r-vec3(0.,0.,0.),vec3(150.,9.5,10.5),3.);
  /* hull hanging below */
  float hull=sdCapX(q-vec3(0.,-46.,0.),118.,21.);
  /* bow observation dome at the east end */
  float bow=length(q-vec3(118.,-46.,0.))-21.;
  hull=min(hull,bow);
  /* pylons */
  vec3 pp=q;pp.x=abs(pp.x)-80.;float py=sdBox(pp-vec3(0.,-17.,0.),vec3(5.,12.,4.));
  vec3 pp2=q;pp2.x=abs(pp2.x)-20.;py=min(py,sdBox(pp2-vec3(0.,-17.,0.),vec3(4.,12.,3.)));
  /* the observation pod, 180 m east of the station, hung from the ring by its own pylon */
  vec3 pb=vec3(180.,-42.,30.),pt=vec3(180.,-5.,3.5);
  vec3 pq=q-pb,pv=pt-pb;float ph=clamp(dot(pq,pv)/dot(pv,pv),0.,1.);
  float pyl=length(pq-pv*ph)-1.2;
  float pod=length(q-pb)-5.5;
  if(uMode==1){pod=1e5;pyl=1e5;}                 /* from inside, the pod is drawn by galleryInterior */
  hull=min(hull,min(pod,pyl));
  /* docking nacelle under the hull */
  float nac=sdCylY(q-vec3(0.,-78.,0.),7.5,12.);
  nac=min(nac,sdCylY(q-vec3(0.,-70.,0.),11.,4.));
  /* radiator fins along the hull */
  vec3 fq=q-vec3(0.,-46.,0.);fq.z=abs(fq.z)-26.;
  float fin=sdBox(fq,vec3(90.,7.,.4));
  float d=sad;mat=2.;
  if(hull<d){d=hull;mat=1.;}
  if(py<d){d=py;mat=2.;}
  if(nac<d){d=nac;mat=4.;}
  if(fin<d){d=fin;mat=3.;}
  /* from the gallery, the bow around you is glass: carve it out of the hull */
  return d;
}
/* central differences, one SDF call site in a loop (Direct3D inlines each call) */
vec3 stationNormal(vec3 q){float m;vec3 g=vec3(0.);
  for(int i=0;i<6+uZero;i++){vec3 e=vec3(i/2==0?.05:0.,i/2==1?.05:0.,i/2==2?.05:0.)*((i&1)==0?1.:-1.);
    float d=stationSDF(q+e,m)*((i&1)==0?1.:-1.);g+=vec3(i/2==0?d:0.,i/2==1?d:0.,i/2==2?d:0.);}
  return normalize(g);}

/* ---------- the ground platform (platform frame: origin at sea level under the cable) ---------- */
float platformSDF(vec3 q,out float mat){
  mat=10.;
  float deck=sdCylY(q-vec3(0.,19.,0.),88.,1.);
  /* columns into the sea */
  vec3 c=q;float an=atan(c.z,c.x);float sec=6.2831853/6.;float a2=mod(an+sec*.5,sec)-sec*.5;
  vec2 cp=length(c.xz)*vec2(cos(a2),sin(a2));
  float col=sdCylY(vec3(cp.x-62.,q.y-6.,cp.y),5.5,13.);
  float pont=length(vec2(length(q.xz)-62.,q.y+2.))-6.;
  /* low buildings and the cable anchor */
  float b1=sdBox(q-vec3(34.,23.5,-30.),vec3(14.,3.5,9.));
  float b2=sdBox(q-vec3(-28.,22.5,42.),vec3(9.,2.5,7.));
  float anc=sdCylY(q-vec3(0.,20.6,0.),.9,.6);
  float d=min(deck,min(col,pont));
  if(b1<d){d=b1;mat=11.;} if(b2<d){d=b2;mat=11.;} if(anc<d){d=anc;mat=12.;}
  return d;
}
vec3 platformNormal(vec3 q){float m;vec3 g=vec3(0.);
  for(int i=0;i<6+uZero;i++){vec3 e=vec3(i/2==0?.03:0.,i/2==1?.03:0.,i/2==2?.03:0.)*((i&1)==0?1.:-1.);
    float d=platformSDF(q+e,m)*((i&1)==0?1.:-1.);g+=vec3(i/2==0?d:0.,i/2==1?d:0.,i/2==2?d:0.);}
  return normalize(g);}

/* ---------- shading for things you could touch ---------- */
vec3 shadeSolid(vec3 P,vec3 N,vec3 rd,vec3 alb,float spec,float rough){
  float hKm=uCamH+P.y*.001;
  vec3 up=normalize(uCamE*1000.+P);
  float m=dot(up,uSun);
  vec3 sunT=transToSpace(RG+max(hKm,0.),m)*sunVis(RG+max(hKm,0.),m);
  float NL=max(dot(N,uSun),0.);
  float upF=dot(N,up)*.5+.5;
  vec3 amb=mix(irrDown(max(hKm,0.),m),irrUp(max(hKm,0.),m),upF)/PI*1.5;
  vec3 H=normalize(uSun-rd);float sp=pow(max(dot(N,H),0.),mix(8.,180.,1.-rough))*spec*(1.-rough)*2.;
  return alb*(sunT*NL/PI+amb)+sunT*NL*sp*.12;
}

/* ---------- the cable ---------- */
/* cable axis: vertical line through (cx, *, cz) relative to camera */
float cableHit(vec3 rd,vec3 axis,float yMin,float yMax,out float tC,out vec3 nC,out float cov){
  vec2 o=-axis.xz;vec2 d=rd.xz;float dd=dot(d,d);cov=0.;tC=-1.;
  if(dd<1e-10)return -1.;
  float tc=-dot(o,d)/dd;               /* closest approach (horizontal) */
  if(tc<0.)return -1.;
  vec2 cp=o+d*tc;float dist=length(cp);
  float y=rd.y*tc;if(y<yMin||y>yMax)return -1.;
  float foot=uPixAng*tc;
  float w=max(foot,2.*CABLE_R);
  cov=(2.*CABLE_R/w)*sat((w*.5-dist)/max(foot,1e-4)+.5);
  if(cov<=0.)return -1.;
  cov=max(cov,1e-4);
  /* exact surface when resolved */
  float b=dot(o,d),c=dot(o,o)-CABLE_R*CABLE_R;float D=b*b-dd*c;
  if(D>0.){float t=(-b-sqrt(D))/dd;if(t>0.){tC=t;vec2 h=o+d*t;nC=normalize(vec3(h.x,0.,h.y));return t;}}
  tC=tc;nC=length(cp)<1e-4?-normalize(vec3(d.x,0.,d.y)):normalize(vec3(cp.x,0.,cp.y));
  return tc;
}

/* ---------- stars ---------- */
vec3 stars(vec3 rd){
  vec3 d=uStarRot*rd;
  vec3 a=abs(d);vec2 uv;float face;
  if(a.x>a.y&&a.x>a.z){uv=d.yz/a.x;face=d.x>0.?0.:1.;}else if(a.y>a.z){uv=d.xz/a.y;face=d.y>0.?2.:3.;}else{uv=d.xy/a.z;face=d.z>0.?4.:5.;}
  vec3 col=vec3(0.);
  float px=uPixAng*190.;
  for(int l=0;l<2;l++){
    float G=l==0?190.:70.;
    vec2 g=uv*G;vec2 id=floor(g);vec2 f=fract(g);
    vec3 h=hash33(vec3(id,face+float(l)*7.));
    vec2 sp=h.xy*.8+.1;float dd=length(f-sp)/(uPixAng*G*.75+1e-5);
    float mag=pow(h.z,l==0?14.:30.);
    float temp=fract(h.x*7.13+h.y*3.1);
    vec3 tint=mix(vec3(.75,.85,1.15),vec3(1.2,.95,.7),temp);
    col+=tint*mag*exp(-dd*dd*1.6)*(l==0?.03:1.);
  }
  return col;
}

/* ---------- background: space, the Sun, stars, airglow ---------- */
/* a faint Milky Way: a band of light round a tilted great circle, broken up by dust */
vec3 milkyWay(vec3 rd){
  vec3 d=uStarRot*rd;
  vec3 ng=normalize(vec3(-.4838,.7470,.4560));
  float b=dot(d,ng);
  vec3 e1=normalize(cross(ng,vec3(0,0,1))),e2=cross(ng,e1);
  float l=atan(dot(d,e2),dot(d,e1));
  vec2 uv=vec2(l*1.6,b*7.);
  float n=textureLod(uWeather,uv*.35+.2,1.).r*.6+textureLod(uWeather,uv*1.1+.7,0.).a*.4;
  float dust=smoothstep(.35,.75,textureLod(uWeather,uv*.7+.45,0.).b);
  float core=exp(-b*b/.012)*(.6+.8*exp(-pow(l-.4,2.)*1.5));
  return vec3(1.,.93,.82)*core*n*(1.-.7*dust*exp(-b*b/.003))*2.5e-7;
}
vec3 background(vec3 rd,vec3 Tview){
  vec3 c=stars(rd)*1.8e-5+milkyWay(rd);
  float cs=dot(rd,uSun);
  float ang=acos(clamp(cs,-1.,1.));
  /* sun disc with limb darkening */
  float disc=1.-smoothstep(SUN_R*.92,SUN_R*1.04,ang);
  float mu=sqrt(max(0.,1.-pow(ang/SUN_R,2.)));
  vec3 limb=vec3(1.)*(.4+.6*pow(mu,.55));
  c+=disc*limb*(1./(PI*SUN_R*SUN_R))*.55;
  /* faint corona glow, so the film has something to halate */
  c+=vec3(1.,.9,.75)*exp(-ang/.02)*.25;
  return c;
}

/* ---------- interior of the car ---------- */
const float CAB_R=1.45,CAB_FLOOR=-1.48,CAB_CEIL=1.02,DOME_Y=.95;
float windowSDF(float s,float y){
  /* s: arc length round the cabin (m), y: height (m). Six tall windows, one every 60 degrees. */
  /* the windows are identical, so the nearest one (by angle) is the closest: no loop needed */
  float az=s/CAB_R;   /* radians, 0 = east, increasing towards north */
  float da=az-floor(az/1.0471976+.5)*1.0471976;   /* to the nearest window centre, every 60 degrees */
  return sdRoundRect(vec2(da*CAB_R,y-.16),vec2(.40*CAB_R,.72),.2);   /* half-width .40 rad */
}
vec3 envTex(vec3 d){float az=atan(d.x,-d.z);float el=asin(clamp(d.y,-1.,1.));return texture(uEnv,vec2(az/(2.*PI)+.5,el/PI+.5)).rgb;}
vec3 cabinLight(vec3 P,vec3 N){
  /* light reaching an interior point: sky through the windows, sun patches, the lamp */
  vec3 E=vec3(0.);
  /* sky light through the windows: sample the env in a few directions */
  for(int i=0;i<6;i++){float a=float(i)*1.0471976;vec3 d=normalize(vec3(cos(a),.12,sin(a)));
    float w=max(dot(N,d),0.);E+=envTex(d)*w;}
  E*=.24;                                           /* the windows a wall point can see */
  E+=envTex(vec3(0,1,0))*(max(N.y,0.)*.9+.12);      /* the glass roof */
  E+=envTex(vec3(0,-1,0))*(max(-N.y,0.)*.3+.03);    /* floor window */
  /* sun patches: does the ray towards the Sun leave through glass? */
  vec3 sd=uSun;vec3 sunT=sunLight(uCamH,normalize(uCamE));
  if(dot(N,sd)>0.&&dot(sunT,vec3(1))>1e-6){
    float dd=dot(sd.xz,sd.xz);
    float pass=0.;
    if(dd>1e-6){
      float b=dot(P.xz,sd.xz),c=dot(P.xz,P.xz)-CAB_R*CAB_R;float D=b*b-dd*c;
      if(D>0.){float t=(-b+sqrt(D))/dd;vec3 X=P+sd*t;
        if(X.y<DOME_Y&&X.y>CAB_FLOOR){float s=atan(X.z,X.x)*CAB_R;pass=1.-smoothstep(-.03,.03,windowSDF(s,X.y));}
        else if(X.y>=DOME_Y)pass=.88;   /* through the glass roof, minus its ribs */
      }
    }
    E+=sunT*pass*max(dot(N,sd),0.);
  }
  /* warm cabin lamp in the ceiling */
  vec3 lp=vec3(0.,CAB_CEIL-.05,.72);vec3 l=lp-P;float ld=length(l);
  E+=vec3(1.,.62,.3)*uCabinLamp*max(dot(N,l/ld),0.)/(ld*ld+.3)*.004;
  return E/PI;
}
vec3 cabinWall(vec3 P,vec3 N,float s,float wsd){
  /* painted metal: warm grey, a handrail band, rivet rows and a label near the west window */
  vec3 alb=vec3(.30,.27,.22);
  float yband=smoothstep(.02,0.,abs(P.y+.66)-.035);
  alb=mix(alb,vec3(.12,.11,.10),yband);
  float riv=step(.82,fract(s*7.))*step(abs(P.y-.98)-.012,0.);
  alb*=1.-riv*.4;
  float seam=smoothstep(.006,0.,abs(fract(s/1.52+.5)-.5)*1.52-.002);
  alb*=1.-seam*.35;
  /* rubber gasket around the windows */
  float gk=smoothstep(.0,.035,wsd)*(1.-smoothstep(.035,.06,wsd));
  alb=mix(alb,vec3(.03,.028,.025),1.-smoothstep(0.,.045,wsd));
  return alb;
}
/* returns: rgb colour, a = 1 if opaque interior; glass passes through with tint/reflection */
vec4 carInterior(vec3 rd,out vec3 glassAdd,out float glassT){
  /* Each branch decides what the pixel is; the lighting (cabinLight) and the reflection in the
     glass (cabinTrace) are evaluated once at the end. Direct3D inlines every call, so one call
     site each keeps the shader small enough to compile quickly. */
  glassAdd=vec3(0.);glassT=1.;
  float dd=dot(rd.xz,rd.xz);
  float tW=dd>1e-8?CAB_R/sqrt(dd):1e9;  /* camera on the axis */
  float yW=rd.y*tW;
  bool lit=false,trace=false;vec3 LP=vec3(0.),LN=vec3(0.,1.,0.),alb=vec3(0.);float lk=1.,alpha=0.;
  vec3 TP=vec3(0.),TR=vec3(0.,1.,0.);float tk=0.;vec3 extra=vec3(0.);
  vec3 sunT=sunLight(uCamH,normalize(uCamE));
  float fw=pow(max(dot(rd,uSun),0.),24.);
  if(yW>DOME_Y){
    /* a glass roof: a dome divided by six ribs over the mullions, a ring rib, and a hatch */
    float b=rd.y*DOME_Y,c=DOME_Y*DOME_Y-CAB_R*CAB_R;float t=b+sqrt(max(b*b-c,0.));
    vec3 P=rd*t;vec3 Q=P-vec3(0.,DOME_Y,0.);
    float az=atan(Q.z,Q.x),el=asin(clamp(Q.y/CAB_R,0.,1.));
    float ca=cos(el)*CAB_R;
    float dm=abs(mod(az,1.0472)-.5236)*ca;                 /* distance to a meridian rib, over the mullions */
    float dr=abs(el-.72)*CAB_R;                            /* the ring rib */
    float rim=el*CAB_R;                                    /* the frame at the base */
    float hatch=(1.5708-el)*CAB_R;                         /* the hatch at the top */
    float frame=min(min(dm-.03,dr-.025),min(rim-.07,hatch-.025));
    vec3 N=-normalize(Q);
    if(frame<0.){
      float k=smoothstep(.0,-.012,frame);
      lit=true;LP=P*.98;LN=N;alb=vec3(.05,.047,.044);alpha=k;
      if(k<1.)glassT=.92;
    }else{
      float cs=max(dot(-rd,N),0.);float F=.04+.96*pow(1.-cs,5.);
      float smudge=smoothstep(.55,.85,texture(uWeather,vec2(az*.4,el*.5)).a);
      trace=true;TP=P*.99;TR=reflect(rd,N);tk=F*.1;extra=sunT*fw*smudge*.00025;
      glassT=.9*(1.-F);
    }
  }else if(yW<CAB_FLOOR){
    /* the floor, with a small window to look straight down */
    float tP=CAB_FLOOR/rd.y;vec3 P=rd*tP;
    float dW=length(P.xz-vec2(.55,0.))-.36;
    LP=P;LN=vec3(0,1,0);
    if(dW<0.){
      float edge=smoothstep(-.03,0.,dW);
      glassT=.92;
      if(edge>0.){lit=true;alb=vec3(.02);lk=3.;alpha=edge;}
    }else{
      alb=vec3(.07,.065,.06);
      float ring=smoothstep(.07,0.,abs(dW-.06)-.03);
      alb=mix(alb,vec3(.04),ring);
      lit=true;alpha=1.;
    }
  }else{
    vec3 P=rd*tW;float s=atan(P.z,P.x)*CAB_R;
    float wsd=windowSDF(s,P.y);
    /* window reveal: check the outer face of the 12 cm wall too */
    float tO=(CAB_R+.12)/sqrt(dd);vec3 PO=rd*tO;float wsdO=windowSDF(atan(PO.z,PO.x)*(CAB_R),PO.y);
    vec3 N=-normalize(vec3(P.x,0.,P.z));
    LP=P;
    if(wsd<0.&&wsdO<0.){
      /* glass: reflection of the lit cabin, dust that catches the sun */
      float c=max(dot(-rd,N),0.);float F=.04+.96*pow(1.-c,5.);
      float dust=texture(uWeather,vec2(s*.9,P.y*.9)+.5).a;
      float smudge=smoothstep(.55,.85,texture(uWeather,vec2(s*.21,P.y*.33)).a);
      trace=true;TP=P;TR=reflect(rd,N);tk=F*.25;extra=sunT*fw*(dust*.00008+smudge*.00025);
      glassT=.9*(1.-F);
    }else if(wsd<0.){
      /* jamb of the window opening */
      lit=true;LN=N;alb=vec3(.10,.09,.08);lk=.8;alpha=1.;
    }else{
      lit=true;LN=N;alb=cabinWall(P,N,s,wsd);alpha=1.;
    }
  }
  if(trace){
    /* the reflection in the glass: out through glass to the sky, or a lit point inside
       (cabinTrace, unrolled here so the cabin is lit at one call site) */
    vec3 P=TP,d=TR;
    float dd=dot(d.xz,d.xz);
    float tW=1e9;
    if(dd>1e-8){float b=dot(P.xz,d.xz),c=dot(P.xz,P.xz)-CAB_R*CAB_R;float D=b*b-dd*c;if(D>0.)tW=(-b+sqrt(D))/dd;}
    bool env=false;
    float tC=(CAB_FLOOR-P.y)/min(d.y,-1e-4);
    if(d.y>0.&&P.y+d.y*tW>DOME_Y)env=true;
    else if(d.y<0.&&tC<tW){
      LP=P+d*tC;LN=vec3(0.,1.,0.);alb=vec3(.07,.065,.06);
      if(length(LP.xz-vec2(.55,0.))<.36)env=true;
    }else{
      LP=P+d*tW;float s=atan(LP.z,LP.x)*CAB_R;float w=windowSDF(s,LP.y);
      if(w<0.)env=true;
      else{LN=-normalize(vec3(LP.x,0.,LP.z));alb=cabinWall(LP,LN,s,w);}
    }
    if(env){glassAdd=envTex(d)*.85*tk+extra;return vec4(0.);}
    lit=true;lk=tk;
  }
  if(!lit)return vec4(0.);
  vec3 c=alb*cabinLight(LP,LN)*lk;
  if(trace){glassAdd=c+extra;return vec4(0.);}
  return vec4(c,alpha);
}

/* ---------- interior of the station's bow gallery ---------- */
vec4 galleryInterior(vec3 rd0,out vec3 glassAdd,out float glassT){
  glassAdd=vec3(0.);glassT=1.;
  /* the pod rides round the ring: keep its floor level with the local horizon */
  float ca=cos(uPodAng),sa=sin(uPodAng);
  vec3 rd=vec3(ca*rd0.x-sa*rd0.y,sa*rd0.x+ca*rd0.y,rd0.z);
  /* a dome of glass ahead (east), divided by ribs; floor below */
  float floorY=-1.6;
  vec3 d=rd;
  vec3 sunT0=sunLight(uCamH,normalize(uCamE));
  if(d.y<0.){float t=floorY/d.y;vec3 P=d*t;
    /* a ring of dark plates round a glass floor; a brass rail at the edge; glass beyond */
    float r=length(P.xz-vec2(-.6,0.));
    bool glassFloor=r<1.55&&min(abs(fract(P.x*.8)-.5),abs(fract(P.z*.8)-.5))>.035;
    if(r<2.3&&!glassFloor){
      vec3 alb=vec3(.035,.032,.03);float g=step(.97,fract(P.x*1.25))+step(.97,fract(P.z*1.25));alb*=1.-g*.35;
      if(abs(r-2.15)<.05)alb=vec3(.35,.26,.12);
      vec3 E=(envTex(vec3(1,0,0))*.25+envTex(vec3(0,-1,0))*.25+envTex(vec3(0,1,0))*.05)/PI;
      E+=sunT0*smoothstep(-.1,.3,dot(normalize(vec3(uSun.x,0,uSun.z)),vec3(1,0,0)))*max(-uSun.y+.15,0.)*.3/PI;
      return vec4(alb*E,1.);}}
  /* dome: sphere of radius 4 around the eye, glazed towards the east */
  float az=atan(d.z,d.x),el=asin(clamp(d.y,-1.,1.));
  /* glazed all round except the hatch to the pylon that holds the pod to the ring (up and south) */
  vec3 bdir=normalize(vec3(0.,42.,-30.));
  bool glazed=el>-1.5&&dot(d,bdir)<.965;
  float ribA=abs(fract(az/(PI/7.))-.5)*(PI/7.)*4.*cos(el);
  float ribE=abs(fract(el/(PI/9.))-.5)*(PI/9.)*4.;
  float rib=min(ribA,ribE);
  float edge=smoothstep(.0,.05,d.x+.05);
  vec3 N=-d;
  if(!glazed||rib<.04){
    vec3 alb=vec3(.022,.021,.02);
    vec3 E=envTex(vec3(1,0,0))*.2+envTex(vec3(0,1,0))*.1;
    vec3 sunT=sunLight(uCamH,normalize(uCamE));
    E+=sunT*max(dot(N,uSun),0.)*.25;
    float k=glazed?smoothstep(.04,.025,rib):1.;
    return vec4(alb*E,k);
  }
  float c=max(dot(-rd,N),0.);float F=.04+.96*pow(1.-c,5.);
  vec3 R=reflect(rd,N);
  vec3 refl=envTex(-R)*.02;
  glassAdd=refl*F;glassT=.92*(1.-F);
  return vec4(0.);
}

/* ---------- the outside world along one ray ---------- */
vec3 outside(vec3 rd){
  
  vec3 camUp=normalize(uCamE);
  float muUp=dot(rd,camUp);
  /* the Earth */
  vec2 te=sphereHitH(muUp,0.);
  float tEarth=te.x>0.?te.x:1e9;
  /* near objects in metres */
  float tNear=1e12;vec3 colNear=vec3(0.);float aNear=0.;
  /* the nearest solid thing is shaded once, after all the tests (one inlined copy of shadeSolid) */
  vec3 nP=vec3(0.),nN=vec3(0.,1.,0.),nAlb=vec3(0.),nEmit=vec3(0.);float nSpec=0.,nRough=1.;bool nDbg=false;
  /* cable */
  if((uDbg&16)==0){
    vec3 axis=uStation*vec3(1.,0.,1.);   /* the cable hangs under the station */
    float yMin=uPlatform.y+20.,yMax=uStation.y-90.;
    float tC;vec3 nC;float cov;
    float th=cableHit(rd,axis,yMin,yMax,tC,nC,cov);
    if(th>0.&&cov>0.){
      vec3 P=rd*tC;
      /* sleeve joints every 25 m, streaming past; blurred by the shutter at speed */
      float y=P.y+0.;float blur=uSpeed/60.+uPixAng*tC*2.;
      float per=25.;float ph=fract((y+uTime*0.)/per);
      float band=smoothstep(.04+blur/per,0.,abs(ph-.5)*2.-.92+blur/per);
      float stripe=.5+.5*sin(atan(nC.z,nC.x)*2.+y*.7);
      float mot=sat(blur/3.);
      vec3 alb=mix(vec3(.005,.005,.0048),vec3(.03,.028,.025),band*(1.-mot*.7)*.4);   /* a near-black carbon tether */
      alb*=mix(.85+.3*stripe,1.,mot);
      nP=P;nN=nC;nAlb=alb;nSpec=0.;nRough=1.;
      tNear=tC;aNear=cov;
    }
  }
  /* drive bogies gripping the cable above and below the car, and the arm that joins them to it.
     They sit on the cable's side facing the car, in a frame turned to face the car. */
  if(uMode==0){
    vec2 ax=uStation.xz;vec2 hdir=normalize(-ax);           /* cable -> car, horizontal */
    vec2 sdir=vec2(-hdir.y,hdir.x);
    /* ray in the cable's frame: x towards the car, z sideways */
    vec3 ro2=vec3(dot(-ax,hdir),0.,dot(-ax,sdir));
    vec3 rd2=vec3(dot(rd.xz,hdir),rd.y,dot(rd.xz,sdir));
    vec3 n;
    for(int k=0;k<2+uZero;k++){
      vec3 c=vec3(.35,k==0?1.75:-1.95,0.);
      float tb=boxHit(ro2-c,rd2,vec3(.55,.42,.62),n);
      if(tb>0.&&tb<tNear){tNear=tb;aNear=1.;vec3 nw=vec3(n.x*hdir.x+n.z*sdir.x,n.y,n.x*hdir.y+n.z*sdir.y);nP=rd*tb;nN=nw;nAlb=vec3(.16,.15,.13);nSpec=.5;nRough=.4;}
    }
    float ta=boxHit(ro2-vec3(.75,0.,0.),rd2,vec3(.45,1.7,.16),n);
    if(ta>0.&&ta<tNear){tNear=ta;aNear=1.;vec3 nw=vec3(n.x*hdir.x+n.z*sdir.x,n.y,n.x*hdir.y+n.z*sdir.y);nP=rd*ta;nN=nw;nAlb=vec3(.2,.19,.17);nSpec=.5;nRough=.4;}
  }
#ifndef RING_HIGH
  /* ground platform */
  if(uCamH<25.&&(uDbg&8)==0){
    vec3 o=-uPlatform;  /* camera in platform frame */
    vec3 n;float tb=boxHit(o-vec3(0.,14.,0.),rd,vec3(92.,20.,92.),n);
    float inside=step(abs(o.x),92.)*step(abs(o.y-14.),20.)*step(abs(o.z),92.);
    if(tb>0.||inside>0.){
      float t=max(tb,0.);float mat=0.;bool hit=false;
      for(int i=0;i<64;i++){vec3 q=o+rd*t;float d=platformSDF(q,mat);if(d<.002*t+.01){hit=true;break;}t+=d;if(t>4000.)break;}
      if(hit&&t<tNear){
        vec3 q=o+rd*t;vec3 N=platformNormal(q);
        vec3 alb=vec3(.20,.20,.19);float spec=.2;
        if(mat==10.){
          float r=length(q.xz);
          /* deck markings: a painted circle and a cross-hatched safety ring */
          alb=vec3(.16,.16,.155);
          alb=mix(alb,vec3(.55,.42,.12),smoothstep(.25,0.,abs(r-14.)-.35));
          alb=mix(alb,vec3(.5,.5,.47),smoothstep(.2,0.,abs(r-84.)-.5));
          float plank=step(.94,fract(q.x*.5))*.15;alb*=1.-plank;
        }else if(mat==11.){alb=vec3(.42,.40,.36);}else if(mat==12.){alb=vec3(.2,.19,.18);}
        vec3 P=rd*t;vec3 c=vec3(0.);nP=P;nN=N;nAlb=alb;nSpec=spec;nRough=.6;nDbg=(uDbg&256)!=0;
        /* deck lamps */
        float r=length(q.xz);float an=atan(q.z,q.x);float lamp=smoothstep(.6,.0,length(vec2((fract(an/(PI/24.))-.5)*r*PI/24.*1.0,r-86.5)))*step(abs(q.y-20.3),.8);
        c+=vec3(1.,.62,.28)*lamp*uNight*2e-4;
        /* windows on the buildings */
        if(mat==11.){vec2 wc=floor(vec2(q.x+q.z,q.y)*vec2(.4,.6));float wv=step(.55,fract((q.x+q.z)*.4))*step(.45,fract(q.y*.6))*step(abs(N.y),.5)*step(.7,hash12(wc));c+=vec3(1.,.62,.28)*wv*uNight*6e-6;}
        nEmit=c;tNear=t;aNear=1.;
      }
    }
  }
#endif
  if(aNear>0.)colNear=(nDbg?(nN*.5+.5)*.05:shadeSolid(nP,nN,rd,nAlb,nSpec,nRough))+nEmit;
  /* the ring tube, exact, and the station */
  vec3 colRing=vec3(0.);float aRing=0.;float tRing=1e12;
  vec3 rP=vec3(0.),rN=vec3(0.,1.,0.),rAlb=vec3(0.),rEmit=vec3(0.);float rSpec=0.,rRough=1.;bool rSolid=false;
  RingRay RR=ringRay(rd);
  float tCross=ringCross(rd);
  float footR=uPixAng*tCross;
  if(tCross>0.&&(uDbg&32)==0){
    float zC=RR.z0+RR.dz*tCross;
    vec3 P=rd*tCross;
    float s=ringS(P);
    vec3 nOut=normalize(P-uC);   /* radial outward at the crossing */
    float m=dot(nOut,uSun);
    float hK=RING_ALT;
    vec3 sunT=transToSpace(RG+hK,m)*sunVis(RG+hK,m);
    /* projected width and lighting of the tube as a line */
    float w=TUBE_A*2.;
    float ff=max(footR,w);
    /* drawn at least ~0.3 px wide so you can follow it into the distance (see About) */
    float wv=max(w,footR*.2*(1.-smoothstep(3e5,4e6,tCross)));
    float covL=(wv/max(footR,wv))*sat((max(footR,wv)*.5-abs(zC))/max(footR,1e-3)+.5);
    if(footR<w*.8){
      vec2 nuz;float tt=tubeHit(RR,min(tEarth*1000.,1e12),nuz);
      if(tt>0.){
        vec3 Pt=rd*tt;vec3 nO=normalize(Pt-uC);vec3 N=normalize(nO*nuz.x+vec3(0.,0.,1.)*nuz.y);
        float st=ringS(Pt);
        /* panels every 12 m, joints every 100 m, a darker rail on top */
        vec3 alb=vec3(.58,.55,.50);
        float pan=smoothstep(.15,0.,abs(fract(st/12.)-.5)*12.-5.85);
        float jnt=smoothstep(.8,0.,abs(fract(st/100.)-.5)*100.-49.);
        alb*=1.-pan*.25-jnt*.35;
        if(nuz.x>.6)alb=mix(alb,vec3(.18,.17,.16),.7);
        float hm=uCamH+Pt.y*.001;
        /* lamps under the tube every 500 m */
        float lp=smoothstep(.6+uPixAng*tt,0.,abs(fract(st/500.)-.5)*500.-249.4)*step(nuz.x,-.6);
        rP=Pt;rN=N;rAlb=alb;rSpec=.7;rRough=.3;rEmit=vec3(1.,.75,.45)*lp*uNight*3e-4;rSolid=true;
        tRing=tt;aRing=1.;
        
      }
    }
    if(aRing==0.&&covL>0.){
      /* line: the octagon's visible faces, each lit as the near tube is */
      vec3 zA=vec3(0.,0.,1.);
      vec3 Ebel=irrDown(100.,m)*1.5,Eup=irrUp(100.,m)*1.5;
      vec3 acc=vec3(0.);float ws=0.;
      for(int k=0;k<8+uZero;k++){
        float a=float(k)*.7853982;vec3 nf=nOut*cos(a)+zA*sin(a);
        float vw=max(dot(nf,-rd),0.);
        acc+=vw*(sunT*max(dot(nf,uSun),0.)/PI+mix(Ebel,Eup,dot(nf,nOut)*.5+.5)/PI);ws+=vw;
      }
      vec3 c=vec3(.58,.55,.5)*acc/max(ws,1e-4);
      colRing=c;aRing=covL;tRing=tCross;
    }
  }
#ifndef RING_LOW
  /* station: SDF, only near it */
  vec3 oS=-uStation;
  if(length(oS)<60000.&&(uDbg&8192)==0){
    vec3 bo=oS-vec3(0.,-40.,0.),bb=vec3(160.,52.,36.);
    vec3 im=1./rd;vec3 k1=-im*bo-abs(im)*bb,k2=-im*bo+abs(im)*bb;
    float tb0=max(max(k1.x,k1.y),k1.z),tb1=min(min(k2.x,k2.y),k2.z);
    if(tb1>max(tb0,0.)){
      float t=max(tb0,0.);float mat=0.;bool hit=false;
      for(int i=0;i<90;i++){vec3 q=oS+rd*t;float d=stationSDF(q,mat);if(d<.0004*t+.01){hit=true;break;}t+=d;if(t>tb1)break;}
      if(hit&&t<tRing){
        vec3 q=oS+rd*t;vec3 N=stationNormal(q);
        vec3 alb=vec3(.64,.62,.58);float spec=.55,rough=.38;vec3 emit=vec3(0.);
        float fw=uPixAng*t;   /* metres per pixel, to fade fine detail */
        if(mat==1.){
          vec2 pc=vec2(q.x/6.,(q.y*.6+q.z*.8)/6.);
          alb*=mix(.86,1.06,hash12(floor(pc)+3.));
          vec2 sm=abs(fract(pc)-.5)*6.;
          alb*=1.-.22*smoothstep(.1+fw,0.,min(sm.x,sm.y)-2.95)*(1.-smoothstep(.2,1.,fw));
          float band=1.-smoothstep(1.1,1.1+fw,abs(abs(q.x)-62.));
          alb=mix(alb,vec3(.74,.27,.08),band);
          float wr=(1.-smoothstep(.8,.8+fw,abs(q.y+38.)))*step(.35,abs(N.z))*step(.42,fract(q.x/3.2))*step(abs(q.x),100.);
          alb=mix(alb,vec3(.025,.024,.022),wr);
          emit+=vec3(1.,.68,.36)*wr*step(.35,hash12(vec2(floor(q.x/3.2),sign(q.z))))*(.0004+4e-5*uNight);
        }else if(mat==2.){
          alb=vec3(.42,.41,.39);
          float rib=1.-smoothstep(.25,.25+fw,abs(fract(q.x/10.)-.5)*10.-4.5);
          alb*=1.-rib*.55;spec=.7;rough=.3;
        }else if(mat==3.){
          alb=vec3(.06,.06,.065)+step(.88,fract(q.x/2.))*.035;spec=.9;rough=.22;
        }else if(mat==4.){
          alb=vec3(.36,.35,.33);
          float ringy=1.-smoothstep(.4,.4+fw,abs(q.y+84.));alb=mix(alb,vec3(.1),ringy);
        }
        rP=rd*t;rN=N;rAlb=alb;rSpec=spec;rRough=rough;rEmit=emit;rSolid=true;
        tRing=t;aRing=1.;
      }
    }
  }

#endif
  if(rSolid)colRing=shadeSolid(rP,rN,rd,rAlb,rSpec,rRough)+rEmit;
  /* depth of the first solid thing (km) */
  float tSolidKm=tEarth;
  if(aNear>=1.)tSolidKm=min(tSolidKm,tNear*.001);
  if(aRing>=1.)tSolidKm=min(tSolidKm,tRing*.001);

  /* clouds */
  float tCl=-1.;
  vec4 cl=vec4(0,0,0,1),ci=vec4(0,0,0,1);
  if((uDbg&2)==0){
    float tV=-1.;vec4 v=vec4(0,0,0,1);
#ifndef RING_HIGH
    if((uDbg&512)==0)v=cloudVolume(rd,muUp,tSolidKm,tV);
#endif
    float tD=-1.;vec4 dk=cloudDecks(rd,muUp,tSolidKm,0.,tD,tEarth<1e8?normalize(uCamE+rd*tEarth):vec3(0.),(uDbg&1024)==0);
    /* volume in front, decks behind it */
    cl=vec4(v.rgb+v.a*dk.rgb,v.a*dk.a);
    tCl=tV>0.?tV:tD;
    ci=cirrus(rd,muUp,tSolidKm);
  }

  /* the far end of the ray: the Earth's surface or space */
  vec3 Lfar;
  int nA=int(mix(12.,26.,uQual));
  vec3 L1=vec3(0.),T1=vec3(1.);
  float split=tCl>0.?tCl:tSolidKm;
  /* (each atmosSeg call site is a full copy of the integrator for Direct3D, so the three
     cases only choose the segments; the integrals are taken once below) */
  int far=0;float b1=0.,a2=0.,b2=0.;
  if(tEarth<1e8&&tSolidKm>=tEarth*.999){far=1;b1=split;a2=split;b2=tEarth;}
  else if(tSolidKm<1e8){far=2;b1=tSolidKm;}
  else{far=3;b1=split<1e8?split:1e9;a2=split;b2=split<1e8?1e9:-1.;}
  vec3 L2=vec3(0.),T2=vec3(1.),L3=vec3(0.),T3=vec3(1.);
  bool ringFront=aRing>=1.&&tRing<tNear,nearFront=aNear>0.&&tNear<tRing;   /* never both */
  /* the three segments in one loop: one inlined copy of the integrator */
  for(int k=0;k<3+uZero;k++){
    float s0=0.,s1=b1;int nk=nA;
    if(k==1){if(far==2||b2<=a2)continue;s0=a2;s1=b2;nk=nA/2+2;}
    if(k==2){if(!ringFront&&!nearFront)continue;s1=(ringFront?tRing:tNear)*.001;nk=nA/2+2;}
    vec3 Lk=vec3(0.),Tk=vec3(1.);atmosSeg(rd,muUp,s0,s1,nk,Lk,Tk);
    if(k==0){L1=Lk;T1=Tk;}else if(k==1){L2=Lk;T2=Tk;}else{L3=Lk;T3=Tk;}
  }
  if(far==1){vec3 pE=uCamE+rd*tEarth;Lfar=L2+T2*shadeEarth(rd,tEarth,pE);}
  else if(far==2)Lfar=vec3(0.);
  else Lfar=L2+T2*background(rd,T1*T2);
  /* compose: clouds and cirrus sit between the split and the far end */
  vec3 behind=Lfar;
  if(uCamH<12.){behind=ci.rgb+ci.a*behind;behind=cl.rgb+cl.a*behind;}
  else{behind=cl.rgb+cl.a*behind;behind=ci.rgb+ci.a*behind;}
  vec3 col=L1+T1*behind;
  /* lamps along the ring every 2 km, seen as points: pixel radiance = intensity / footprint^2 */
  if(tCross>0.&&uNight>0.&&tCross*.001<tEarth&&(uDbg&32)==0){
    vec3 P=rd*tCross;float s=ringS(P);float zC=RR.z0+RR.dz*tCross;
    float ds=(abs(fract(s/2000.)-.5)*2000.-1000.);ds=abs(ds);
    float px=max(footR,1.);
    float spread=exp(-(ds*ds+zC*zC)/(px*px*.6));
    vec3 Tr=uCamH<100.?transToSpace(RG+uCamH,muUp):vec3(1.);
    /* beacons on the casing (my addition): bright enough to trace the ring across a twilight sky */
    col+=vec3(1.,.8,.55)*uNight*24./(px*px)*spread*Tr*step(1500.,length(P-uStation));
  }
  /* the ring as a line (in front of the far scene when nearer than it) */
  if(aRing>0.&&aRing<1.&&tRing*.001<tEarth){
    vec3 Tr=vec3(1.);
    if(uCamH<100.)Tr=transToSpace(RG+uCamH,muUp);
    col=mix(col,colRing*Tr,aRing);
  }
  if(ringFront||nearFront){
    if(ringFront)col=L3+T3*colRing;
    else col=mix(col,L3+T3*colNear,aNear);   /* air between the camera and a nearby object */
  }
  /* the neighbouring stations, 15 and 30 degrees round the ring: their cables as threads
     down to the surface (drawn at least half a pixel wide), the stations as small lights */
  for(int j=-2;j<=2;j++){
    if(j==0)continue;
    float th=float(j)*.2617994;
    vec3 rad=vec3(sin(th),cos(th),0.);
    vec3 Sj=uC+rad*RR_M;
    vec3 A=Sj-rad*92.,B=uC+rad*(RG*1000.+25.);
    vec3 v=B-A;float b=dot(rd,v),c=dot(v,v),dd=dot(rd,-A),e=dot(v,-A);
    float den=c-b*b;if(abs(den)<1e-6)continue;
    float tc=clamp((e-b*dd)/den,0.,1.);
    vec3 X=A+tc*v;float sc=dot(X,rd);
    if(sc<=0.||sc*.001>tEarth)continue;
    float dist=length(rd*sc-X);
    float foot=uPixAng*sc;float wv=max(.64,foot*.5);
    float cv=(wv/max(foot,wv))*sat((max(foot,wv)*.5-dist)/max(foot,1e-3)+.5);
    col=mix(col,col*.15,cv);
    /* the station itself: a lit dot */
    float dl=length(Sj);float ang=acos(clamp(dot(rd,Sj/dl),-1.,1.));float sz=max(160./dl,uPixAng*1.1);
    float m=dot(rad,uSun);vec3 sunT=transToSpace(RG+RING_ALT,m)*sunVis(RG+RING_ALT,m);
    col+=(sunT*.12*min(1.,pow(160./dl/uPixAng,2.)+.002)+vec3(1.,.75,.45)*uNight*4e-4)*exp(-pow(ang/sz,2.));
  }
#ifndef RING_LOW
  /* the station's lights: strobes on the saddle ends, a ring of docking lights under the nacelle */
  if(length(oS)<80000.){
    float bl=step(.9,fract(uTime*.5));
    for(int i=0;i<10;i++){
      vec3 L;vec3 lc;float I;
      if(i<2){L=vec3(i==0?-152.:152.,3.,0.);lc=vec3(1.,.97,.9);I=bl*3.;}
      else{float a=float(i-2)*.7853982;L=vec3(cos(a)*7.6,-90.2,sin(a)*7.6);lc=vec3(1.,.72,.38);I=.35+.65*uNight;}
      vec3 lp=uStation+L;float dl=length(lp);
      if(dl>tNear&&aNear>=1.)continue;
      float ang=acos(clamp(dot(rd,lp/dl),-1.,1.));
      float sz=max(.4/dl,uPixAng*1.3);
      col+=lc*I*exp(-pow(ang/sz,2.))*min(1.,pow(.4/dl/uPixAng,2.)+.05)*.012;
    }
  }
#endif
  return col;
}

void main(){
  
  vec2 fc=gl_FragCoord.xy;
  VOL_MAX=mix(120.,55.,smoothstep(1.5,8.,uCamH));
  if((uDbg&64)!=0){vec2 u=fc/uRes;vec4 w=texture(uWeather,u*vec2(uRes.x/uRes.y,1.));oCol=vec4(w.r,w.g,w.b*0.,1.)*.2;return;}
  if((uDbg&128)!=0){vec2 u=fc/uRes;oCol=vec4(texture(uIrr,u).rgb*2.,1.);if(u.y>.5)oCol=vec4(texture(uTrans,u).rgb*.2,1.);return;}
  /* per-pixel white noise advanced by the golden ratio each frame: decorrelated in space,
     evenly spread in time, so still frames average out cleanly */
  jit=fract(hash12(fc*1.37+vec2(17.,3.))+uFrame*.6180339);
  vec2 ndc=(fc/uRes)*2.-1.;
  vec3 rd=normalize(uView*vec3(ndc.x*uTanHalf.x,ndc.y*uTanHalf.y,-1.));
  vec3 gA;float gT;vec4 inter=vec4(0.);
  int mode=(uDbg&4)!=0?2:uMode;
  if(mode==0)inter=carInterior(rd,gA,gT);
#ifndef RING_LOW
  else if(mode==1)inter=galleryInterior(rd,gA,gT);
#endif
  else{gA=vec3(0.);gT=1.;}
  vec3 col;float mask=1.;
  if(inter.a>=1.){col=inter.rgb;mask=0.;}
  else{
    vec3 o=outside(rd);
    col=(uDbg&1)!=0?o:o*gT+gA;
    if(inter.a>0.){col=mix(col,inter.rgb,inter.a);mask=1.-inter.a;}
  }
  /* docking: the car slides into the station */
  col*=1.-uDock;
  oCol=vec4(max(col,0.),mask);
}`;

/* Two builds of the view shader, so the first one compiles quickly (Direct3D's compiler takes
   seconds on shaders this size): LOW for the platform and the climb below 240 km (no station,
   no gallery), HIGH from 40 km up and in the gallery (no platform, no cloud volume, which only
   exist low down). The ride switches between them; see renderer.js. */
export const FS_MAIN_LOW = FS_MAIN.replace('#version 300 es\n', '#version 300 es\n#define RING_LOW 1\n');
export const FS_MAIN_HIGH = FS_MAIN.replace('#version 300 es\n', '#version 300 es\n#define RING_HIGH 1\n');

/* ------------------------------------------------------------- bloom chain */
export const FS_DOWN = HEAD + `
uniform sampler2D uSrc;uniform vec2 uTexel;uniform float uFirst;uniform sampler2D uMeter;
in vec2 vUv;out vec4 o;
float gExpo;
vec3 s(vec2 uv){vec3 c=texture(uSrc,uv).rgb;if(uFirst>.5){vec3 e=c*gExpo;float m=max(e.r,max(e.g,e.b));c=c/(1.+m/40.);}return c;}
void main(){
  gExpo=exp(texture(uMeter,vec2(.5)).r);
  vec2 t=uTexel;
  vec3 a=s(vUv+t*vec2(-2,2)),b=s(vUv+t*vec2(0,2)),c=s(vUv+t*vec2(2,2));
  vec3 d=s(vUv+t*vec2(-2,0)),e=s(vUv),f=s(vUv+t*vec2(2,0));
  vec3 g=s(vUv+t*vec2(-2,-2)),h=s(vUv+t*vec2(0,-2)),i=s(vUv+t*vec2(2,-2));
  vec3 j=s(vUv+t*vec2(-1,1)),k=s(vUv+t*vec2(1,1)),l=s(vUv+t*vec2(-1,-1)),m=s(vUv+t*vec2(1,-1));
  vec3 col=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
  float msk=texture(uSrc,vUv).a;
  o=vec4(col,msk);
}`;

export const FS_UP = HEAD + `
uniform sampler2D uSrc;uniform sampler2D uBase;uniform vec2 uTexel;uniform float uMix;
in vec2 vUv;out vec4 o;
void main(){
  vec2 t=uTexel;
  vec3 c=texture(uSrc,vUv).rgb*4.;
  c+=(texture(uSrc,vUv+t*vec2(-1,0)).rgb+texture(uSrc,vUv+t*vec2(1,0)).rgb+texture(uSrc,vUv+t*vec2(0,-1)).rgb+texture(uSrc,vUv+t*vec2(0,1)).rgb)*2.;
  c+=texture(uSrc,vUv+t*vec2(-1,-1)).rgb+texture(uSrc,vUv+t*vec2(1,-1)).rgb+texture(uSrc,vUv+t*vec2(-1,1)).rgb+texture(uSrc,vUv+t*vec2(1,1)).rgb;
  c/=16.;
  vec4 b=texture(uBase,vUv);
  o=vec4(b.rgb+c*uMix,b.a);
}`;

/* accumulation of still frames (progressive refinement when nothing moves) */
export const FS_ACC = HEAD + `
uniform sampler2D uCur;uniform sampler2D uPrev;uniform float uW;
in vec2 vUv;out vec4 o;
void main(){o=mix(texture(uPrev,vUv),texture(uCur,vUv),uW);}`;

/* metering: log-average luminance of the outside view, eased over time */
export const FS_METER = HEAD + `
uniform sampler2D uSrc;uniform sampler2D uSrcHi;uniform sampler2D uPrev;uniform float uRate;uniform vec2 uSrcSize;uniform float uMinMean;
out vec4 o;
void main(){
  float s=0.,w=0.;
  for(int y=0;y<12;y++)for(int x=0;x<16;x++){
    vec2 uv=(vec2(x,y)+.5)/vec2(16.,12.);
    vec4 c=texture(uSrc,uv);
    float l=dot(c.rgb,vec3(.2126,.7152,.0722));
    if(!(l>=0.&&l<1e6))continue;
    vec2 q=uv-.5;float cw=exp(-dot(q,q)*3.2);  /* centre-weighted, like the camera */
    float ww=cw*(.05+c.a);
    s+=log(max(l,1e-7))*ww;w+=ww;
  }
  float lg=s/max(w,1e-6);
  /* second pass: arithmetic mean of the outside, clipped so the Sun can't dominate */
  float s2=0.,w2=0.;float cap=max(exp(lg)*24.,.9);
  for(int y=0;y<12;y++)for(int x=0;x<16;x++){
    vec2 uv=(vec2(x,y)+.5)/vec2(16.,12.);vec4 c=texture(uSrc,uv);
    float l0=dot(c.rgb,vec3(.2126,.7152,.0722));if(!(l0>=0.&&l0<1e6))continue;float l=min(l0,cap);vec2 q=uv-.5;float cw=exp(-dot(q,q)*3.2);float ww=cw*(.03+c.a);
    s2+=l*ww;w2+=ww;}
  float mean=max(s2/max(w2,1e-6),1e-7);
  /* brightest sizeable patch, ignoring the Sun */
  /* from the quarter-resolution image, so thin bright things (a cable, a hull) register */
  float mx=1e-7;
  for(int y=0;y<30;y++)for(int x=0;x<40;x++){vec2 uv=(vec2(x,y)+.5)/vec2(40.,30.);vec4 c=texture(uSrcHi,uv);
    float l=dot(c.rgb,vec3(.2126,.7152,.0722));if(l>=0.&&l<cap*6.)mx=max(mx,l*(.25+.75*c.a));}
  float E=min(min(log(.18/mean),log(2.4/mx)),log(.18/uMinMean));
  float prev=texture(uPrev,vec2(.5)).r;
  float v=uRate>=1.?E:mix(prev,E,uRate);
  o=vec4(v,E,0.,1.);
}`;

/* ------------------------------------------------- the film: Ektachrome-ish */
export const FS_FINAL = HEAD + `
uniform sampler2D uScene;uniform sampler2D uB1;uniform sampler2D uB2;uniform sampler2D uB3;uniform sampler2D uB4;
uniform sampler2D uMeter;uniform vec2 uRes;uniform float uGrainSeed;uniform float uExpBias;uniform vec2 uSunUv;uniform float uSunOn;
uniform float uGrainAmt;uniform float uAspect;uniform float uDebug;
in vec2 vUv;out vec4 o;
float sat(float x){return clamp(x,0.,1.);}
float h12(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y);}
vec3 toSRGB(vec3 c){c=clamp(c,0.,1.);return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
void main(){
  vec2 uv=vUv;
  if(uDebug>0.){vec3 c=texture(uScene,uv).rgb*exp(uExpBias)*uDebug;c=c/(1.+c);o=vec4(pow(c,vec3(1./2.2)),1.);return;}
  vec2 q=uv-.5;q.x*=uAspect;
  float r2=dot(q,q);
  /* a touch of lateral colour towards the corners */
  vec2 ca=(uv-.5)*.0016;
  vec3 sc;
  sc.r=texture(uScene,uv+ca).r;sc.g=texture(uScene,uv).g;sc.b=texture(uScene,uv-ca).b;
  vec3 b1=texture(uB1,uv).rgb,b2=texture(uB2,uv).rgb,b3=texture(uB3,uv).rgb,b4=texture(uB4,uv).rgb;
  /* exposure from the meter; slide film is exposed for the highlights */
  float expo=exp(texture(uMeter,vec2(.5)).r+uExpBias);
  expo=clamp(expo,1e-3,3e5);
  vec3 bloom=b1*.5+b2*.3+b3*.2;
  vec3 hal=(b1*.25+b2*.35+b3*.4);
  vec3 c=sc*expo+bloom*expo*.012;
  /* halation: light scattered back through the base, mostly into the red layer */
  vec3 halC=max(hal*expo-1.6,0.);
  c+=halC*vec3(1.,.45,.22)*.02;
  /* lens ghosts from the Sun */
  float sunSeen=0.;
  if(uSunOn>0.){vec3 sv=textureLod(uScene,uSunUv,0.).rgb;sunSeen=smoothstep(.5,8.,dot(sv,vec3(.33))*expo);}
  if(sunSeen>0.){
    vec2 sp=uSunUv-.5;
    for(int i=0;i<4;i++){
      float k=float(i);float f=-.35-k*.42;vec2 gp=.5+sp*f;
      vec2 d=uv-gp;d.x*=uAspect;float rr=length(d);float rad=.018+k*.016;
      float g=smoothstep(rad,rad*.82,rr)*(.5+.5*smoothstep(rad*.4,rad,rr));
      vec3 gc=k==0.?vec3(.35,.5,.25):k==1.?vec3(.6,.35,.18):k==2.?vec3(.25,.35,.5):vec3(.5,.42,.25);
      c+=gc*g*sunSeen*.05;
    }
  }
  /* vignette of the lens (cos^4, softened) */
  float vig=pow(cos(atan(sqrt(r2)*1.15)),4.);
  c*=mix(1.,vig,.75);
  /* reversal film: log exposure -> dye densities -> transmitted light */
  vec3 lx=log2(max(c,1e-6)/.18);
  /* fitted so grey prints near 20%, two and a half stops under is near black, and
     two and a half over is a creamy highlight; red clears a touch earlier (warm) */
  vec3 dmin=vec3(.07,.09,.13),dmax=vec3(2.72,2.70,2.64);
  vec3 off=vec3(-1.64,-1.52,-1.40);
  vec3 kk=vec3(.78,.80,.83);
  vec3 D=dmin+(dmax-dmin)/(1.+exp(kk*(lx-off)));
  /* dye cross-talk: richer, slightly warm colour */
  float Dm=(D.r+D.g+D.b)/3.;
  D=Dm+(D-Dm)*1.12;
  D+=vec3(-.01,.0,.025)*smoothstep(1.6,.4,Dm);
  /* grain: in density, strongest in the mid-tones */
  vec2 gp=gl_FragCoord.xy/1.15+uGrainSeed*vec2(131.7,71.3);
  float gn=(vn(gp)+vn(gp*1.9+17.)*.6+vn(gp*.55+5.)*.5)/2.1-.5;
  float sig=uGrainAmt*(.05+.11*exp(-pow(Dm-1.25,2.)*1.4));
  D+=gn*sig*vec3(1.,1.02,1.08)+vec3(vn(gp*1.3+3.)-.5,0.,vn(gp*1.2+9.)-.5)*sig*.25;
  vec3 Tm=pow(vec3(10.),-D);
  /* shown on a warm light table */
  Tm*=vec3(1.04,1.0,.94)*1.05;
  o=vec4(toSRGB(Tm),1.);
}`;
