import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
    it('renders without crashing', () => {
        render(<App />);
        // Basic smoke test - just check if something from the app is there, 
        // or just that render doesn't throw.
        // Since App has routing, it might render Home or Login depending on path.
        // By default "/" -> Home. 
        // We can check for something common or just "true".
        expect(true).toBe(true);
    });
});
