import React from 'react';
import { render as rtlRender, type RenderOptions } from '@testing-library/react-native';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../tamagui.config';
import { UIProvider } from '@/providers/ui-provider';

function AllProviders({ children }: { children: React.ReactNode }) {
    return (
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
            <UIProvider>{children}</UIProvider>
        </TamaguiProvider>
    );
}

export async function render(ui: React.ReactElement, options?: RenderOptions) {
    return rtlRender(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react-native';
