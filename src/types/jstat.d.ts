declare module 'jstat' {
  const jStat: {
    normal: {
      cdf(x: number, mean: number, std: number): number;
      pdf(x: number, mean: number, std: number): number;
    };
  };
  export default jStat;
}
