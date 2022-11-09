export interface CSP {
    'default-src'?: string[],
    'base-uri'?: string[],
    'child-src'?: string[],
    'connect-src'?: string[],
    'font-src'?: string[],
    'form-action'?: string[],
    'frame-ancestors'?: string[],
    'frame-src'?: string[],
    'img-src'?: string[],
    'manifest-src'?: string[],
    'media-src'?: string[],
    'object-src'?: string[],
    'script-src'?: string[],
    'style-src'?: string[],
    'report-uri'?: string[]
}

