export function setProp(key: string, value: any) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(key, JSON.stringify(value));
}
export function getProp(key: string): Object | null {
  const props = PropertiesService.getUserProperties();
  const data = props.getProperty(key);
  if (data) {
    return JSON.parse(data);
  } else {
    return null;
  }
}
export function addProp(key: string, value: any) {
  let data = {};
  const current = getProp(key);
  if (current) {
    data = current;
  }
  const newData = { ...data, ...value };
  setProp(key, newData);
}
