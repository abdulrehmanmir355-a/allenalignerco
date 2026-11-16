export function inventoryBalance(onHand:number,kind:'RECEIVE'|'ISSUE',quantity:number){
 if(!Number.isSafeInteger(onHand)||onHand<0||onHand>1000000000)throw new Error('Invalid stock balance.');
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000000)throw new Error('Enter a whole quantity between 1 and 1,000,000,000.');
 if(kind!=='RECEIVE'&&kind!=='ISSUE')throw new Error('Invalid stock movement.');
 const balance=onHand+(kind==='RECEIVE'?quantity:-quantity);
 if(balance<0)throw new Error('Insufficient stock. Reduce the issue quantity.');
 if(balance>1000000000)throw new Error('This receipt exceeds the supported stock limit.');
 return balance;
}
