import symbol from './assets/oneshowlearn-symbol.svg';

export function BrandSymbol({className=''}) {
  return <img className={`osl-brand-symbol ${className}`} src={symbol} alt="" aria-hidden="true"/>;
}

// Shared vector symbol + real text: sharp in the drawer, compact sidebar and retina headers.
export function BrandIdentity({tagline='Learn · Build · Grow'}) {
  return <><BrandSymbol/><span className="osl-brand-copy"><b className="osl-brand-wordmark">OneShow<em>Learn</em></b><small className="osl-brand-tagline">{tagline}</small></span></>;
}
