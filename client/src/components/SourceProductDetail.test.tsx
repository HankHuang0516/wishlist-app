import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import SourceProductDetail from './SourceProductDetail';
import OriginalSourceLink from './OriginalSourceLink';
import { makeSourceLead } from '../__tests__/fixtures/sourceLead';
afterEach(() => localStorage.clear());
it('retains original source facts, pending-contact status and photo order', () => {
 localStorage.setItem('user-locale','zh-TW');const item=makeSourceLead();render(<SourceProductDetail item={item}/>);
 expect(screen.getByText(item.title)).toBeVisible();expect(screen.getByText(item.publicFacts!.priceText)).toBeVisible();expect(screen.getByText(item.publicFacts!.sourceAccessNotice)).toBeVisible();
 expect(screen.getByText(item.summary)).toBeVisible();expect(screen.getByText(/尚未核實原賣家/)).toBeVisible();expect(screen.getAllByRole('img')[0]).toHaveAttribute('src',item.media![0].imageUrl);
 expect(screen.getByRole('link',{name:'原始來源'})).toHaveAttribute('href',item.canonicalUrl);
});
it('shows the no-area and no-photo states without inventing a price or pickup point', () => {
 localStorage.setItem('user-locale','en-US');const item={...makeSourceLead(),locationPrecision:'CONTACT_FOR_LOCATION' as const,county:null,district:null,publicPlaceName:null,publicAddress:null,latitude:null,longitude:null,media:[],publicFacts:null};render(<SourceProductDetail item={item}/>);
 expect(screen.getByText('Ask about price')).toBeVisible();expect(screen.getByText(/No area provided/)).toBeVisible();expect(screen.getByText('No item image is available')).toBeVisible();expect(screen.queryByText('臺南市')).not.toBeInTheDocument();
});
it('does not label a lookalike domain as Facebook', () => {
 localStorage.setItem('user-locale','en-US');render(<OriginalSourceLink url="https://facebook.com.example.invalid/post"/>);expect(screen.getByRole('link',{name:'Original source'})).toHaveAttribute('href','https://facebook.com.example.invalid/post');expect(screen.queryByText('View original Facebook post')).not.toBeInTheDocument();
});
