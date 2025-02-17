import { IS, toStr, uniqueKeys } from "./utils"

export function alignLeft(str:string, len:number, pad:string = ' ') : string {
    if (len < 0) return ''
    let aLen = len + 1 - str.length
    if (aLen <= 0) return str
    return pad + str + pad.repeat(len + 1 - str.length)
}
export function alignCenter(str:string, len:number, pad:string = ' ') : string {
    if (len < 0) return ''
    if (!str) str = ''
    let nLen = str.length
    let half = Math.floor(len / 2 - nLen / 2)
    let odds = Math.abs((nLen % 2) - (len % 2))
    return pad.repeat(half + 1) + str + pad.repeat(half + 1 + odds)
}
export function alignRight(str:string, len:number, pad:string = ' ') : string {
    if (len < 0) return ''
    let aLen = len + 1 - str.length
    if (aLen <= 0) return str
    return pad.repeat(len + 1 - str.length) + str + pad
}
export function alignAuto(obj:any, len:number, pad:string = ' ') : string {
    let str = `${obj}`
    if (str.length <= len) {
    return IS.num(obj)
        ? alignRight(str, len, pad)
        : alignLeft(str, len, pad)
    }
    return str
}

export class Inspect {
  
    static dump(obj:any) : string {
        if (IS.rec(obj)) {
            if (IS.fn(obj.build)) {
                obj = obj.build()
            }
            if ("sql" in obj && "params" in obj) {
                return [obj.sql, `PARAMS ${Inspect.dump(obj.params).replaceAll('"','')}`].join('\n') + '\n'
            }
        }
        let to = JSON.stringify(obj, null, 4)
        return to.replace(/\\"/g,'')
    }
  
    static dumpTable(rows:any[]) : string {
        let mapRows = rows
        let keys = uniqueKeys(mapRows)
        let sizes:{[index:string]:number} = {}

        keys.forEach(k => {
            let max = k.length
            mapRows.forEach(row => {
                let col = row[k]
                if (col != null) {
                    let valSize = `${col}`.length
                    if (valSize > max) {
                        max = valSize
                    }
                }
            })
            sizes[k] = max
        })

        // sum + ' padding ' + |
        let sizesLen = Object.keys(sizes).length
        let rowWidth = Object.keys(sizes).map(k => sizes[k]).reduce((p, c) => p + c, 0) +
            (sizesLen * 2) +
            (sizesLen + 1)
        let sb:string[] = []
        sb.push(`+${'-'.repeat(rowWidth - 2)}+`)
        let head = '|'
        keys.forEach(k => head += alignCenter(k, sizes[k]) + '|')
        sb.push(head)
        sb.push(`|${'-'.repeat(rowWidth - 2)}|`)

        mapRows.forEach(row => {
            let to = '|'
            keys.forEach(k => to += '' + alignAuto(row[k], sizes[k]) + '|')
            sb.push(to)
        })
        sb.push(`+${'-'.repeat(rowWidth - 2)}+`)

        return sb.join('\n')
    }
}

export function Watch(fn:(() => Record<string,any>)|(() => void)) {
    try {

        const results = fn()
        if (!results) return
        for (const key in results) {
            console.log(`${key}:`)
            const val = results[key]
            if (IS.arr(val)) {
                console.table(val)
            } else {
                if (!IS.rec(val))
                    console.log(toStr(val).trim())
                else
                    console.log(Inspect.dump(val))
            }
            console.log()
        }

    } catch(e) {
        console.error(`${e}`)
    }
}