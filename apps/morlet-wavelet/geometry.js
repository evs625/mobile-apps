export function envelope(t,sigma){ if (!(sigma>0)) throw new RangeError('sigma must be positive');return Math.exp(-0.5*(t/sigma)**2); }
export function complexWavelet(t,{cycle=5.5,sigma=1.35,phase=0}={}){const a=envelope(t,sigma);const theta=(cycle*2*Math.PI/8.4)*t+phase;return [a*Math.cos(theta),a*Math.sin(theta)];}
