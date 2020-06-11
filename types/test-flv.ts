import flvjs from '../';

type LoaderStatusAlias = flvjs.LoaderStatus;
type LoaderErrorsAlias = flvjs.LoaderErrors;

interface MediaDataSourceExt extends flvjs.MediaDataSource {
    example: string;
}
