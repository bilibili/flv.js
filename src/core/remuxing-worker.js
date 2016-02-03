import RemuxingController from './remuxing-controller.js';

var RemuxingWorker = function (self) {

    self.addEventListener('message', function (e) {
        switch (e.data.cmd) {
            case 'init':
                console.log('worker onmessage: init');
                break;
            case 'seek':
                console.log('worker onmessage: seek');
                self.postMessage({event: 'onMetadata'});
                break;
        }
    });

};

export default RemuxingWorker;