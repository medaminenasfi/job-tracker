// Browser preview harness only: mimics the extension APIs the popup uses so the
// real built bundle renders outside of Chrome. Not part of the extension build.
window.chrome = {
  runtime: {
    sendMessage: (message, callback) => {
      let response;
      switch (message && message.type) {
        case 'GET_TOKEN':
          response = { token: 'preview-token' };
          break;
        case 'GET_ME':
          response = {
            success: true,
            data: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
          };
          break;
        case 'GET_JOBS':
          response = {
            success: true,
            data: [
              {
                id: 'j1',
                title: 'Senior Frontend Engineer',
                company: 'Acme Corp',
                url: 'https://jobs.example.com/j/42',
                status: 'SAVED',
              },
            ],
          };
          break;
        default:
          response = { success: true };
      }
      if (callback) callback(response);
      return Promise.resolve(response);
    },
    lastError: undefined,
    onMessage: { addListener() {}, removeListener() {} },
  },
  tabs: {
    query: (_query, callback) =>
      callback([{ id: 7, url: 'https://jobs.example.com/j/42' }]),
    sendMessage: (_id, _message, callback) =>
      callback({
        job: {
          title: 'Senior Frontend Engineer',
          company: 'Acme Corp',
          location: 'Remote (US)',
          source: 'linkedin',
          salary: '$150k – $185k',
        },
      }),
    create() {},
  },
  scripting: { executeScript() {} },
};
