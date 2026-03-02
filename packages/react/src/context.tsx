import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { ZupaConnection } from './connection';

export interface ZupaContextValue {
    connection: ZupaConnection;
}

const ZupaContext = createContext<ZupaContextValue | null>(null);

export interface ZupaProviderProps {
    url: string;
    clientId?: string;
    authToken?: string;
    children: React.ReactNode;
}

export const ZupaProvider: React.FC<ZupaProviderProps> = ({ url, clientId, authToken, children }) => {
    const connection = useMemo(() => new ZupaConnection(url, {
        ...(clientId !== undefined && { clientId }),
        ...(authToken !== undefined && { authToken })
    }), [url, clientId, authToken]);

    useEffect(() => {
        connection.connect();
        return () => connection.disconnect();
    }, [connection]);

    return (
        <ZupaContext.Provider value={{ connection }}>
            {children}
        </ZupaContext.Provider>
    );
};

export const useZupa = () => {
    const context = useContext(ZupaContext);
    if (!context) {
        throw new Error('useZupa must be used within a ZupaProvider');
    }
    return context;
};
