if (process.env.NODE_ENV === 'test') {
    process.env.NODE_ENV = 'testing';
}

await import('./utils.js');
