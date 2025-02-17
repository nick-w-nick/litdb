import { describe, it, expect } from 'bun:test'
import { contacts, Contact, Order } from './data'
import { $, db } from './db'
import { useFilterSync, omit, pick, table, column, SnakeCaseStrategy, DefaultStrategy } from '../src'

const recreateContacts = () => {
    db.dropTable(Contact)
    db.createTable(Contact)
    db.insertAll(contacts)
}

describe('SQLite Driver Tests', () => {

    it ('Can log contacts', () => {
        recreateContacts()
        const origRows = db.all($.from(Contact))
        $.dump(origRows)
        $.dump(omit(origRows, ['phone','createdAt','updatedAt']))
        $.dump(pick(origRows, ['id','firstName','lastName','age']))
        $.dump(db.arrays($.from(Contact).select`id, firstName, lastName, age`))
    })

    it ('can use templated string', () => {
        recreateContacts()
        let getContact = (id:number) => 
            db.one<Contact>`select firstName, lastName from Contact where id = ${id}`

        let contact = getContact(1)!
        $.log(contact)
        expect(contact.firstName).toBe('John')
        expect(contact.lastName).toBe('Doe')

        contact = getContact(2)!
        expect(contact.firstName).toBe('Jane')
        expect(contact.lastName).toBe('Smith')
    })

    it ('does map into Class', () => {
        recreateContacts()

        // No select, selects all columns of Primary table which uses 'into' implicitly
        expect(db.one($.from(Contact).where(c => $`${c.id} = ${contacts[0].id}`))).toBeInstanceOf(Contact)
        
        db.dropTable(Order)
        db.createTable(Order)
        db.insert(new Order({ contactId:1 }))
        expect(db.one($.from(Contact).join(Order, { on:(c,o) => $`${c.id} = ${o.contactId}` }))).toBeInstanceOf(Contact)

        // Any select invalidates implicit into
        const q = $.from(Contact).where(c => $`${c.id} = ${contacts[0].id}`)
        expect(db.one(q.select('*'))).not.toBeInstanceOf(Contact)

        // Use into to return results into class
        expect(db.one(q.into(Contact))).toBeInstanceOf(Contact)

        const dbContacts = db.all($.from(Contact).into(Contact))
        for (const row of dbContacts) {
            expect(row).toBeInstanceOf(Contact)
        }
    })

    it ('does Filter prepareSync', () => {
        const sqls:string[] = []
        const sub = useFilterSync(db, sql => sqls.push(sql[0]))
        db.one`SELECT 1`
        db.one`SELECT 2`
        expect(sqls).toEqual(['SELECT 1', 'SELECT 2'])
        sub.release()
        db.one`SELECT 3`
        expect(sqls.length).toEqual(2)
    })

    it ('does CRUD Contact Table', () => {

        var sub:any = null
        // const sub = useFilterSync(db, sql => console.log(sql))
        
        db.dropTable(Contact)

        expect(db.listTables()).not.toContain(Contact.name)

        db.createTable(Contact)

        expect(db.listTables()).toContain(Contact.name)

        var { changes, lastInsertRowid } = db.insert(contacts[0])
        expect(changes).toBe(1)
        expect(lastInsertRowid).toBe(1)

        expect(db.value($.from(Contact).select`COUNT(*)`)).toBe(1)

        var { changes, lastInsertRowid } = db.insertAll(contacts.slice(1))
        expect(changes).toBe(4)
        expect(lastInsertRowid).toBe(5)

        expect(db.value($.from(Contact).select`COUNT(*)`)).toBe(contacts.length)

        var dbContacts = $.from(Contact).select({ props:['id','firstName','lastName','age'] }).into(Contact)
        if (sub) $.dump(db.all(dbContacts))

        var updateContact = new Contact(contacts[0])
        updateContact.age = 40
        var { changes } = db.update(updateContact)
        expect(changes).toBe(1)
        var { changes } = db.update(updateContact, { onlyProps:['age'] })
        expect(changes).toBe(1)

        if (sub) $.dump(db.all(dbContacts))

        const q = $.from(Contact).where(c => $`${c.id} = ${updateContact.id}`).into(Contact)
        const one = db.one(q)!
        expect(one.age).toBe(updateContact.age)

        // named props
        // sub = useFilterSync(db, sql => console.log(sql))
        db.exec($.update(Contact).set({ age:41, city:'Austin', state:'Texas' }).where(c => $`${c.age} = ${updateContact.age}`))
        expect(db.value($.from(Contact).where(c => $`${c.age} = 41`).rowCount())).toBe(2)
        
        // function
        db.exec($.update(Contact).set(c => $`${c.age} = ${42}`).where(c => $`${c.age} = 41`))
        expect(db.value($.from(Contact).where(c => $`${c.age} = 42`).rowCount())).toBe(2)

        // templated string
        const qUpdate = $.update(Contact)
        const c = qUpdate.ref
        db.exec(qUpdate.set`${c.age} = ${updateContact.age}`.where`${c.age} = 42`)

        db.delete(one)

        expect(db.one(q)).toBeNull()

        db.exec($.deleteFrom(Contact).where(c => $`${c.age} = 40`))
        const remaining = db.all(dbContacts)
        if (sub) $.dump(remaining)

        expect(remaining).toBeArrayOfSize(3)
        for (const contact of remaining) {
            expect(contact.age).not.toEqual(40)
        }

        expect(db.value($.from(Contact).select`COUNT(*)`)).toBe(remaining.length)
        expect(db.value($.from(Contact).select`COUNT(*)`.into(Number))).toBe(remaining.length)
        expect(db.value($.from(Contact).rowCount())).toBe(remaining.length)

        expect(db.value($.from(Contact).where(c => $`${c.age} = 40`).exists())).toBeFalse()

        expect(db.value($.from(Contact).exists())).toBeTrue()

        db.exec($.deleteFrom(Contact))

        expect(db.value($.from(Contact).exists())).toBeFalse()

        expect(db.value($.from(Contact).select`COUNT(*)`)).toBe(0)
        expect(db.value($.from(Contact).rowCount())).toBe(0)

        if (sub) sub.release()
    })

    it ('can select column', () => {
        recreateContacts()

        // const sub = useFilterSync(db, sql => console.log(sql))
        const q = $.from(Contact)
        expect(db.column(q.clone().select(c => $`${c.id}`))).toEqual(contacts.map(x => x.id))

        expect(db.column(q.clone().select(c => $`${c.firstName}`))).toEqual(contacts.map(x => x.firstName))
        
        expect(db.column(q.clone().select(c => $`${c.age}`))).toEqual(contacts.map(x => x.age))

        expect(db.column(q.clone().select(c => $`${c.createdAt}`))).toBeArrayOfSize(contacts.length)

        const age = 27
        expect(db.column`SELECT age from Contact`).toEqual(contacts.map(x => x.age))
        expect(db.column`SELECT age from Contact WHERE age = ${age}`).toEqual(contacts.filter(x => x.age == 27).map(x => x.age))
        expect(db.column`SELECT age from Contact WHERE age = ${age}`).toEqual(contacts.filter(x => x.age == 27).map(x => x.age))
        expect(db.column($.sql('SELECT age from Contact WHERE age = $age', { age }))).toEqual(contacts.filter(x => x.age == 27).map(x => x.age))
    })

    it ('can select arrays', () => {
        recreateContacts()

        const sub = false
        // const sub = useFilterSync(db, sql => console.log(sql))
        
        const q = $.from(Contact).select({ props:['id', 'firstName', 'lastName', 'age', 'email', 'city'] })

        const contactArrays = contacts.map(({ id, firstName, lastName, age, email, city }) => 
            [id, firstName, lastName, age, email, city])

        var dbContacts = db.arrays(q.clone())
        if (sub) $.dump(dbContacts)

        expect(dbContacts).toEqual(contactArrays)
        expect(db.arrays`SELECT id, firstName, lastName, age, email, city FROM Contact`).toEqual(contactArrays)
        
        const age = 27
        expect(db.arrays`SELECT id, firstName, lastName, age, email, city FROM Contact WHERE age = ${age}`)
            .toEqual(contactArrays.filter(x => x[3] === age))

        expect(db.arrays($.sql(`SELECT id, firstName, lastName, age, email, city FROM Contact WHERE age = $age`, { age })))
            .toEqual(contactArrays.filter(x => x[3] === age))
        
        const id = 1
        expect(db.array(q.clone().where(c => $`${c.id} = ${id}`))).toEqual(contactArrays[0])
        expect(db.array`SELECT id, firstName, lastName, age, email, city FROM Contact WHERE id = ${id}`).toEqual(contactArrays[0])
        expect(db.array($.sql(`SELECT id, firstName, lastName, age, email, city FROM Contact WHERE id = $id`, { id }))).toEqual(contactArrays[0])
    })

    it ('Does populate Table columns using alias', () => {
        @table() class Person {
            constructor(data?: Partial<Person>) { Object.assign(this, data) }
            @column("INTEGER",  { autoIncrement:true, alias:'person_id' }) id = 0
            @column("TEXT",     { required:true, alias:'display_name' }) name = ''
            @column("TEXT",     { required:true, index:true, unique:true }) email = ''
            @column("DATETIME", { alias:'created' }) createdAt = new Date()
        }

        // useFilterSync(db, sql => console.log(sql))
        db.dropTable(Person)
        db.createTable(Person)

        db.insertAll([
            new Person({ name:'John Doe', email:'john.doe@email.org', createdAt: new Date('2025-01-01') }),
            new Person({ name:'Jane Doe', email:'jane.doe@email.org', createdAt: new Date('2025-01-02') }),
        ])
    
        const people = db.all<Person>($.from(Person).orderBy(p => $`${p.id}`))

        // $.log(people)

        expect(people).toEqual([
            new Person({
                id: 1,
                name: "John Doe",
                email: "john.doe@email.org",
                createdAt: new Date('2025-01-01')
            }),
            new Person({
                id:2, 
                name:'Jane Doe', 
                email:'jane.doe@email.org', 
                createdAt: new Date('2025-01-02') 
            })
        ])
    })


    it ('Does populate Table columns using alias', () => {
        @table() class Person {
            constructor(data?: Partial<Person>) { Object.assign(this, data) }
            @column("INTEGER",  { autoIncrement:true }) id = 0
            @column("TEXT",     { required:true }) name = ''
            @column("TEXT",     { required:true, index:true, unique:true, alias:"primaryEmail" }) email = ''
            @column("DATETIME") createdAt = new Date()
        }

        // useFilterSync(db, sql => console.log(sql))
        $.dialect.strategy = new SnakeCaseStrategy()
        db.dropTable(Person)
        db.createTable(Person)

        db.insertAll([
            new Person({ name:'John Doe', email:'john.doe@email.org', createdAt: new Date('2025-01-01') }),
            new Person({ name:'Jane Doe', email:'jane.doe@email.org', createdAt: new Date('2025-01-02') }),
        ])
    
        const people = db.all<Person>($.from(Person).orderBy(p => $`${p.id}`))

        // $.log(people)

        expect(people).toEqual([
            new Person({
                id: 1,
                name: "John Doe",
                email: "john.doe@email.org",
                createdAt: new Date('2025-01-01')
            }),
            new Person({
                id:2, 
                name:'Jane Doe', 
                email:'jane.doe@email.org', 
                createdAt: new Date('2025-01-02') 
            })
        ])
        $.dialect.strategy = new DefaultStrategy()
    })

})
