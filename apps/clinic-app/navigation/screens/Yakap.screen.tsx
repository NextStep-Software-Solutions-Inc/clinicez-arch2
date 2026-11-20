import React from 'react';
import ToolsScreen, { type ToolsScreenProps } from './Tools.screen';

/**
 * Legacy compatibility entrypoint for PhilHealth Yakap deep links.
 * The standalone PhilHealth Yakap screen now lives inside the unified Clinic Tools directory.
 */
export default function YakapScreen({ route }: ToolsScreenProps = {}) {
  return (
    <ToolsScreen
      route={{
        params: {
          tab: route?.params?.tab ?? 'yakap',
          tool: route?.params?.tool,
        },
      }}
    />
  );
}
