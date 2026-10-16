import test from 'node:test';
import assert from 'node:assert/strict';
import {envelope,complexWavelet} from '../apps/morlet-wavelet/geometry.js';
const near=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} not close to ${b}`);
test('Gaussian envelope is centered, even, bounded, decays',()=>{near(envelope(0,1.35),1);near(envelope(1.3,1.35),envelope(-1.3,1.35));assert.ok(envelope(4,1.35)<envelope(2,1.35));});
test('complex wavelet magnitude follows envelope',()=>{for(const t of [-3,-1.5,0,1.5,3]){const z=complexWavelet(t,{cycle:5.5,sigma:1.35,phase:0});near(Math.hypot(...z),envelope(t,1.35));}});
test('wavelet phase rotates the complex output',()=>{const [re,im]=complexWavelet(0,{phase:Math.PI/2});near(re,0);near(im,1);});
test('zero or negative sigma is rejected',()=>{assert.throws(()=>envelope(0,0),RangeError);assert.throws(()=>envelope(0,-1),RangeError);});
